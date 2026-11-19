# @openhomefoundation/icons

Every [Lucide](https://lucide.dev) icon plus Open Home Foundation's own, generated from SVG files into formats any stack can use.

## Use

Each icon is a small piece of data: the shapes inside its SVG. You import the icons you need by name and hand them to whatever draws them. A bundler keeps only the icons you import.

```ts
import { iconHouse, iconSearch } from "@openhomefoundation/icons";
```

### Lit

```ts
import { iconHouse } from "@openhomefoundation/icons";
import "@openhomefoundation/icons/lit/define.js"; // registers <ohf-icon>

html`<ohf-icon .icon=${iconHouse} label="Home"></ohf-icon>`;
```

| Attribute | Meaning |
|---|---|
| `.icon` | The icon data (a property, not an attribute) |
| `label` | Accessible name. Without it the icon is hidden from screen readers |
| `size` | Width and height. A number is pixels; any CSS length works. Default 24px, or `--ohf-icon-size` |
| `stroke-width` | Default 2, or `--ohf-icon-stroke-width` |

The icon takes the text colour around it. Style the SVG itself with `ohf-icon::part(svg)`.

To draw an icon inside your own template without a custom element (light DOM, server rendering):

```ts
import { renderIcon } from "@openhomefoundation/icons/lit";

html`<button>${renderIcon(iconX, { size: 18, label: "Close" })}</button>`;
```

To register the element under your own tag, import the class instead of `define.js`:

```ts
import { OhfIcon } from "@openhomefoundation/icons/lit";
customElements.define("my-icon", class extends OhfIcon {});
```

### Vue

One component per icon, with the same names and props as `@lucide/vue` (`size`, `color`, `strokeWidth`, `absoluteStrokeWidth`), so an app switches by changing its import path.

```vue
<script setup lang="ts">
import { House, X } from "@openhomefoundation/icons/vue";
</script>

<template>
	<House :size="20" />
	<X aria-label="Close" />
</template>
```

Classes, attributes and listeners land on the `<svg>`. The icon is hidden from screen readers unless it has an `aria-label` or a `<title>` in its slot.

### Astro, server templates, plain JavaScript

```ts
import { iconHouse, iconToSvg } from "@openhomefoundation/icons";

iconToSvg(iconHouse, { size: 20, label: "Home" }); // "<svg …>…</svg>"
```

### No build step

- `@openhomefoundation/icons/svg/house.svg`: one SVG file per icon
- `@openhomefoundation/icons/sprite.svg`: every icon as a `<symbol>`, for `<use href="sprite.svg#house">`
- `@openhomefoundation/icons/icons/house.js`: one module per icon, for importing without a bundler
- `@openhomefoundation/icons/icons.json`: names, tags and aliases, for search

## Names

`arrow-left` is exported as `iconArrowLeft`. When Lucide renames an icon, the old name keeps working and is marked deprecated in the types.

## How it is built

```
lucide-static (pinned dev dependency) ─┐
                                       ├─ collect → validate → parse → write dist/
src/custom/*.svg (OHF icons) ──────────┘
```

Lucide's SVGs are not copied into this repo. The build reads them from `node_modules`, so updating Lucide is a one-line version bump. A test checks that the generated data matches Lucide's own for every icon.

To add an OHF icon, see [src/custom/README.md](src/custom/README.md).

## Licence

OHF icons are Apache-2.0. Lucide icons are ISC (some MIT, from Feather); their licence ships in the package as `LICENSE-lucide`.
