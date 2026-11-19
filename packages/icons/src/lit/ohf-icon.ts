import { css, html, LitElement, nothing } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import type { TemplateResult } from "lit";

import { iconToSvgContent } from "../to-svg.js";
import type { IconNode } from "../types.js";

/**
 * Draws one icon. It takes the icon's data rather than a name, so a page only
 * ships the icons it imports.
 *
 * @example
 * import { iconHouse } from "@openhomefoundation/icons";
 * import "@openhomefoundation/icons/lit/define.js";
 * html`<ohf-icon .icon=${iconHouse} label="Home"></ohf-icon>`
 *
 * @csspart svg - The `<svg>` element.
 * @cssprop [--ohf-icon-size=24px] - Width and height, when `size` is not set.
 * @cssprop [--ohf-icon-stroke-width=2] - Stroke width, when `stroke-width` is not set.
 */
export class OhfIcon extends LitElement {
	static override properties = {
		icon: { attribute: false },
		label: {},
		size: {},
		strokeWidth: { attribute: "stroke-width" },
	};

	static override styles = css`
		:host {
			display: inline-flex;
			flex: none;
			vertical-align: middle;
			color: inherit;
		}
		svg {
			display: block;
			width: var(--ohf-icon-size, 24px);
			height: var(--ohf-icon-size, 24px);
			stroke-width: var(--ohf-icon-stroke-width, 2);
		}
	`;

	/** The icon to draw, imported from `@openhomefoundation/icons`. */
	declare icon?: IconNode;

	/**
	 * Accessible name. Without it the icon is hidden from screen readers, which
	 * is right when it sits next to text that says the same thing.
	 */
	declare label?: string;

	/** Width and height. A number is pixels; any CSS length also works. */
	declare size?: string | number;

	/** Stroke width on the 24×24 grid. */
	declare strokeWidth?: string | number;

	protected override render(): TemplateResult {
		// 0 is a real value, so test for "not set" rather than falsy.
		const isSet = (value: string | number | null | undefined): boolean =>
			value !== undefined && value !== null && value !== "";
		const size = !isSet(this.size)
			? undefined
			: /^[\d.]+$/.test(String(this.size))
				? `${this.size}px`
				: String(this.size);
		const style = [
			size ? `width:${size};height:${size}` : "",
			isSet(this.strokeWidth) ? `stroke-width:${this.strokeWidth}` : "",
		]
			.filter(Boolean)
			.join(";");
		return html`<svg
			part="svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
			style=${style || nothing}
			role=${this.label ? "img" : nothing}
			aria-label=${this.label || nothing}
			aria-hidden=${this.label ? nothing : "true"}
		>
			${this.icon ? unsafeSVG(iconToSvgContent(this.icon)) : nothing}
		</svg>`;
	}
}
