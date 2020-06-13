import { svgNamespace, isElement, isInFlow, isInline, isPositioned } from './common'
import { parse } from 'path'

declare global {
	interface CSSStyleDeclaration {
		mixBlendMode: string
		maskBorder: string
		isolation: string
		webkitOverflowScrolling: string
		contain: string
		displayOutside: string
		displayInside: string
	}
}

const stackingContextEstablishingProperties = new Set<string>([
	'clipPath',
	'contain',
	'filter',
	'isolation',
	'mask',
	'maskBorder',
	'maskImage',
	'mixBlendMode',
	'opacity',
	'perspective',
	'position',
	'transform',
	'webkitOverflowScrolling',
	'zIndex',
])

export function establishesStackingContext(node: Node): boolean {
	if (!node.ownerDocument?.defaultView) {
		throw new Error("Node's ownerDocument has no defaultView")
	}
	if (!isElement(node)) {
		return false
	}
	// https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z_index/The_stacking_context
	const styles = node.ownerDocument.defaultView.getComputedStyle(node)
	const parentStyles = node.parentElement && node.ownerDocument.defaultView.getComputedStyle(node.parentElement)
	return !!(
		((styles.position === 'absolute' || styles.position === 'relative') && styles.zIndex !== 'auto') ||
		styles.position === 'fixed' ||
		styles.position === 'sticky' ||
		(parentStyles &&
			(parentStyles.display === 'flex' || parentStyles.display === 'grid') &&
			styles.zIndex !== 'auto') ||
		parseFloat(styles.opacity) !== 1 ||
		styles.mixBlendMode !== 'normal' ||
		styles.transform !== 'none' ||
		styles.filter !== 'none' ||
		styles.perspective !== 'none' ||
		styles.clipPath !== 'none' ||
		styles.mask !== 'none' ||
		styles.maskImage !== 'none' ||
		styles.maskBorder !== 'none' ||
		styles.isolation === 'isolate' ||
		styles.webkitOverflowScrolling === 'touch' ||
		styles.contain === 'layout' ||
		styles.contain === 'paint' ||
		styles.contain === 'strict' ||
		styles.contain === 'content' ||
		(styles.willChange &&
			styles.willChange.split(',').some(property => stackingContextEstablishingProperties.has(property.trim())))
	)
}

export interface StackingLayers {
	/** 1. The background and borders of the element forming the stacking context. */
	readonly rootBackgroundAndBorders: SVGElement

	/** 2. The child stacking contexts with negative stack levels (most negative first). */
	readonly childStackingContextsWithNegativeStackLevels: SVGElement

	/** 3. The in-flow, non-inline-level, non-positioned descendants. */
	readonly inFlowNonInlineNonPositionedDescendants: SVGElement

	/** 4. The non-positioned floats. */
	readonly nonPositionedFloats: SVGElement

	/** 5. The in-flow, inline-level, non-positioned descendants, including inline tables and inline blocks. */
	readonly inFlowInlineLevelNonPositionedDescendants: SVGElement

	/** 6. The child stacking contexts with stack level 0 and the positioned descendants with stack level 0. */
	readonly childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero: SVGElement

	/** 7. The child stacking contexts with positive stack levels (least positive first). */
	readonly childStackingContextsWithPositiveStackLevels: SVGElement
}

function createStackingLayer(parent: SVGElement, layerName: keyof StackingLayers): SVGGElement {
	const layer = document.createElementNS(svgNamespace, 'g')
	layer.dataset.stackingLayer = layerName
	parent.append(layer)
	return layer
}

export function createStackingLayers(container: SVGElement): StackingLayers {
	container.dataset.stackingContext = 'true'
	return {
		rootBackgroundAndBorders: createStackingLayer(container, 'rootBackgroundAndBorders'),
		childStackingContextsWithNegativeStackLevels: createStackingLayer(
			container,
			'childStackingContextsWithNegativeStackLevels'
		),
		inFlowNonInlineNonPositionedDescendants: createStackingLayer(
			container,
			'inFlowNonInlineNonPositionedDescendants'
		),
		nonPositionedFloats: createStackingLayer(container, 'nonPositionedFloats'),
		inFlowInlineLevelNonPositionedDescendants: createStackingLayer(
			container,
			'inFlowInlineLevelNonPositionedDescendants'
		),
		childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero: createStackingLayer(
			container,
			'childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero'
		),
		childStackingContextsWithPositiveStackLevels: createStackingLayer(
			container,
			'childStackingContextsWithPositiveStackLevels'
		),
	}
}

export function determineStackingLayer(element: Element): keyof StackingLayers {
	if (!element.ownerDocument.defaultView) {
		throw new Error("Element's ownerDocument has no defaultView")
	}

	// https://www.w3.org/TR/CSS22/visuren.html#layers
	// https://www.w3.org/TR/CSS22/zindex.html

	// Note: the root element is not handled here, but in handleElement().
	const styles = element.ownerDocument.defaultView.getComputedStyle(element)
	const zIndex = styles.zIndex !== 'auto' ? parseInt(styles.zIndex, 10) : undefined
	if (zIndex !== undefined && zIndex < 0 && establishesStackingContext(element)) {
		return 'childStackingContextsWithNegativeStackLevels'
	}
	if (isInFlow(element, styles) && !isInline(styles) && !isPositioned(styles)) {
		return 'inFlowNonInlineNonPositionedDescendants'
	}
	if (!isPositioned(styles) && styles.float !== 'none') {
		return 'nonPositionedFloats'
	}
	if (isInFlow(element, styles) && isInline(styles) && !isPositioned(styles)) {
		return 'inFlowInlineLevelNonPositionedDescendants'
	}
	if (zIndex === 0 && (isPositioned(styles) || establishesStackingContext(element))) {
		return 'childStackingContextsWithStackLevelZeroAndPositionedDescendantsWithStackLevelZero'
	}
	if (zIndex !== undefined && zIndex > 0 && establishesStackingContext(element)) {
		return 'childStackingContextsWithPositiveStackLevels'
	}
	throw new Error('Did not find appropiate stacking layer')
}

export function sortChildrenByZIndex(parent: SVGElement): void {
	const sorted = [...parent.children].sort((a, b) => {
		const zIndexA = (a as SVGElement).dataset.zIndex
		const zIndexB = (b as SVGElement).dataset.zIndex
		if (!zIndexA || !zIndexB) {
			throw new Error('Expected node to have data-z-index attribute')
		}
		return parseInt(zIndexA, 10) - parseInt(zIndexB, 10)
	})
	for (const child of sorted) {
		parent.append(child)
	}
}

export function sortStackingLayerChildren(stackingLayers: StackingLayers): void {
	sortChildrenByZIndex(stackingLayers.childStackingContextsWithNegativeStackLevels)
	sortChildrenByZIndex(stackingLayers.childStackingContextsWithPositiveStackLevels)
}