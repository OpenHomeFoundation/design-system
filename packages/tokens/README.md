# @openhomefoundation/tokens

Design tokens for Open Home Foundation products: colours, spacing, radii, sizes, typography, shadows and motion.

The source is JSON in the [W3C design tokens format](https://www.designtokens.org/) (DTCG). The build turns it into CSS custom properties, JavaScript constants and a JSON file.

## Use

```css
@import "@openhomefoundation/tokens/css/tokens.css";
@import "@openhomefoundation/tokens/css/themes/dark.css";

.card {
	background: var(--ohf-color-bg-surface-default);
	padding: var(--ohf-space-16);
	border-radius: var(--ohf-radius-container);
}
```

```html
<html data-theme="auto" data-brand="ddb">
```

| File | Contains |
|---|---|
| `css/tokens.css` | Every token, in the light theme and the OHF brand |
| `css/themes/dark.css` | The dark theme |
| `css/brands/ddb.css` | The Device Database brand |

- `data-theme` takes `light`, `dark` or `auto` (follows the system). With no attribute the page is light.
- `data-brand` selects a brand. With no attribute the brand is OHF.
- Set both on `<html>`. You can also set `data-theme` on any element to theme one region.
- Import `tokens.css` first, then the theme, then the brand. Later files override earlier ones.

In JavaScript:

```ts
// Resolved values, light theme and OHF brand. For canvas, charts and maths.
import { colorGreen700, space16 } from "@openhomefoundation/tokens";

// The custom property, which follows the theme and brand. For styles.
import { colorBgCanvas } from "@openhomefoundation/tokens/vars";
// "var(--ohf-color-bg-canvas)"
```

Each token is its own named export, so a bundler keeps only the ones you import.

`@openhomefoundation/tokens/tokens.json` holds every brand and theme with resolved values, for docs and Figma.

## Naming

A token's path becomes its name: `color.bg.surface.default` is `--ohf-color-bg-surface-default` in CSS and `colorBgSurfaceDefault` in JS.

- **Primitives** are raw values: `color.warm-grey.50`, `space.16`, `radius.md`. Spacing, font sizes and line heights are named by their pixel value, so `space.16` is 16px.
- **Semantic tokens** say what a value is for and point at a primitive: `color.bg.canvas`, `color.text.subtle`, `color.border.default`, `radius.control`. Use these in components. They change with the theme.
- **Brand tokens** (`brand.accent.50` to `brand.accent.950`) are the accent ramp. Each brand points it at a different colour.

Font sizes and line heights are output in `rem`; everything else in `px`.

## Source

```
figma/                    the designer's Figma exports, untouched
src/primitive/
  *.figma.tokens.json     imported from Figma, do not edit
  color.ramps.tokens.json generated, do not edit
  *.tokens.json           scales we added by hand
src/themes/               light and dark, imported from Figma, do not edit
src/brands/               one file per brand, edited by hand
```

### Where each value comes from

- **The designer's values are never changed.** A test compares the built Device Database brand against the Figma export, colour by colour, in both themes.
- **Missing ramp steps** are filled so every colour has steps 50 to 950:
  - green, red, amber, violet and teal are Tailwind v3's palette, so the missing steps are Tailwind's.
  - blue, grey and warm-grey are custom, so the missing steps are interpolated between the designer's neighbouring steps.
- **OHF colours:** `light-blue` is Home Assistant's primary ramp (500 is OHF Light Blue `#18bcf2`). `dark-blue` and `blue-grey` are ramps built around OHF Dark Blue, Grey and Dark Grey. `color.ohf.*` names the five brand colours exactly.
- **Scales we added:** extra spacing and radius steps, breakpoints, container widths, font families and weights, shadows, z-index, durations and easings.

Every generated colour says where it came from in its `$extensions`, so the designer can review them.

### When the designer sends new exports

Replace the four files in `figma/`, then:

```bash
pnpm import:figma
```

```bash
pnpm generate:ramps
```

```bash
pnpm build
```

```bash
pnpm test
```

### Adding a brand

Add `src/brands/<name>.tokens.json`. Point `brand.accent` at a colour ramp and override any semantic token the brand needs. The build writes `css/brands/<name>.css` with only what differs from the OHF brand.
