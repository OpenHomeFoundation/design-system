import { h } from "vue";
import type { FunctionalComponent, SVGAttributes } from "vue";

import type { IconNode } from "../types.js";

/** The same props as `@lucide/vue`, so an app can switch by changing its import. */
export type IconProps = {
	/** Width and height in pixels. Defaults to 24. */
	size?: number | string;
	/** Stroke colour. Defaults to the text colour. */
	color?: string;
	/** Stroke width on the 24×24 grid. Defaults to 2. */
	strokeWidth?: number | string;
	/** Keep the stroke the same thickness on screen whatever the size. */
	absoluteStrokeWidth?: boolean;
};

export type IconComponent = FunctionalComponent<IconProps & SVGAttributes>;

/**
 * Makes the Vue component for one icon. Other attributes, classes and
 * listeners land on the `<svg>`. The icon is hidden from screen readers unless
 * it is given an `aria-label` or a `<title>` in its slot.
 */
export const createIcon = (name: string, node: IconNode): IconComponent => {
	const component: IconComponent = (props, { attrs, slots }) => {
		const size = props.size ?? 24;
		const width = props.strokeWidth ?? 2;
		const children = slots.default?.() ?? [];
		const named =
			children.length > 0 || "aria-label" in attrs || "aria-labelledby" in attrs;
		return h(
			"svg",
			{
				xmlns: "http://www.w3.org/2000/svg",
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: props.color ?? "currentColor",
				"stroke-width": props.absoluteStrokeWidth
					? (Number(width) * 24) / Number(size)
					: width,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				...(named ? { role: "img" } : { "aria-hidden": "true" }),
				...attrs,
				class: ["ohf-icon", `ohf-icon-${name}`, attrs.class],
			},
			[...node.map(([tag, attributes]) => h(tag, attributes)), ...children],
		);
	};
	component.props = {
		size: [Number, String],
		color: String,
		strokeWidth: [Number, String],
		absoluteStrokeWidth: Boolean,
	};
	component.inheritAttrs = false;
	component.displayName = name;
	return component;
};
