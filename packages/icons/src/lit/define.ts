import { OhfIcon } from "./ohf-icon.js";

// Importing this file registers <ohf-icon>. Import the class from
// "@openhomefoundation/icons/lit" instead to register it under your own tag.
if (!customElements.get("ohf-icon")) {
	customElements.define("ohf-icon", OhfIcon);
}

declare global {
	interface HTMLElementTagNameMap {
		"ohf-icon": OhfIcon;
	}
}
