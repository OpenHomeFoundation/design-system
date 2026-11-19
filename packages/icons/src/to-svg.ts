import type { IconNode } from "./types.js";

export type IconOptions = {
	/** Width and height in pixels. Defaults to 24. */
	size?: number | string;
	/** Stroke width on the 24×24 grid. Defaults to 2. */
	strokeWidth?: number | string;
	/**
	 * Accessible name. Without it the icon is hidden from screen readers, which
	 * is right when it sits next to text that says the same thing.
	 */
	label?: string;
	/** Extra class names for the `<svg>` element. */
	class?: string;
};

/** The shapes an icon may contain. Anything else is dropped. */
const SHAPES = new Set([
	"path",
	"circle",
	"rect",
	"line",
	"ellipse",
	"polyline",
	"polygon",
]);

const ATTRIBUTE_NAME = /^[a-z][a-z0-9-]*$/i;

/** Event handlers (`onclick`, `onload`, …) run script, so they are never written. */
const EVENT_HANDLER = /^on/i;

const escape = (value: string): string =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

const attributes = (values: Record<string, string | undefined>): string =>
	Object.entries(values)
		.filter(
			(entry): entry is [string, string] =>
				entry[1] !== undefined &&
				ATTRIBUTE_NAME.test(entry[0]) &&
				!EVENT_HANDLER.test(entry[0]),
		)
		.map(([name, value]) => ` ${name}="${escape(String(value))}"`)
		.join("");

/** The shapes of an icon as an SVG string, without the surrounding `<svg>`. */
export const iconToSvgContent = (icon: IconNode): string =>
	icon
		.filter(([tag]) => SHAPES.has(tag))
		.map(([tag, values]) => `<${tag}${attributes(values)}/>`)
		.join("");

/** The attributes of the `<svg>` element for the given options. */
export const svgAttributes = (
	options: IconOptions = {},
): Record<string, string | undefined> => {
	const size = String(options.size ?? 24);
	return {
		xmlns: "http://www.w3.org/2000/svg",
		class: options.class,
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": String(options.strokeWidth ?? 2),
		"stroke-linecap": "round",
		"stroke-linejoin": "round",
		...(options.label
			? { role: "img", "aria-label": options.label }
			: { "aria-hidden": "true" }),
	};
};

/**
 * An icon as a complete SVG string. Works anywhere HTML is built from strings:
 * Astro (`set:html`), server templates, plain JavaScript.
 */
export const iconToSvg = (icon: IconNode, options: IconOptions = {}): string =>
	`<svg${attributes(svgAttributes(options))}>${iconToSvgContent(icon)}</svg>`;
