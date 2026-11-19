import { html, nothing } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import type { TemplateResult } from "lit";

import { iconToSvgContent } from "../to-svg.js";
import type { IconOptions } from "../to-svg.js";
import type { IconNode } from "../types.js";

/**
 * Renders an icon as an inline `<svg>` inside another Lit template. Use this
 * when you do not want a custom element, for example in light DOM or when
 * server rendering.
 *
 * @example html`<button>${renderIcon(iconX, { size: 18, label: "Close" })}</button>`
 */
export const renderIcon = (
	icon: IconNode,
	options: IconOptions = {},
): TemplateResult => {
	const size = options.size ?? 24;
	return html`<svg
		xmlns="http://www.w3.org/2000/svg"
		class=${options.class ?? nothing}
		width=${size}
		height=${size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width=${options.strokeWidth ?? 2}
		stroke-linecap="round"
		stroke-linejoin="round"
		role=${options.label ? "img" : nothing}
		aria-label=${options.label || nothing}
		aria-hidden=${options.label ? nothing : "true"}
	>
		${unsafeSVG(iconToSvgContent(icon))}
	</svg>`;
};
