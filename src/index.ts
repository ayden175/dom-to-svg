import { svgNamespace, createCounter, traverseDOM, isSVGImageElement, fetchAsDataURL } from './common.js'
import { walkNode } from './traversal.js'
import { createStackingLayers } from './stacking.js'

export function documentToSVG(document: Document): SVGSVGElement {
	const svgElement = document.createElementNS(svgNamespace, 'svg')
	svgElement.setAttribute('xmlns', svgNamespace)

	walkNode(document.body, {
		currentSvgParent: svgElement,
		stackingLayers: createStackingLayers(svgElement),
		parentStackingLayer: svgElement,
		getUniqueId: createCounter(),
		labels: new Map(),
	})

	const bounds = document.body.getBoundingClientRect()
	svgElement.setAttribute('width', bounds.width.toString())
	svgElement.setAttribute('height', bounds.height.toString())
	svgElement.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)

	return svgElement
}

export async function inlineResources(element: Element): Promise<void> {
	if (isSVGImageElement(element)) {
		const dataURL = await fetchAsDataURL(new URL(element.href.baseVal))
		element.setAttribute('href', dataURL.href)
	}
	await Promise.all([...element.children].map(inlineResources))
}