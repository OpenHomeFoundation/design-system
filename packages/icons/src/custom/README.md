# OHF icons

Icons that Lucide does not have go here. Each icon is two files:

- `<name>.svg`: the drawing
- `<name>.json`: optional, `{ "tags": ["search", "words"], "aliases": ["old-name"] }`

The build checks every SVG against Lucide's drawing rules so the two sets look like one:

- The name is kebab-case, starts with a letter and is not already a Lucide icon or alias.
- The `<svg>` has `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"` and `stroke-linejoin="round"`.
- Shapes (`path`, `circle`, `rect`, `line`, `ellipse`, `polyline`, `polygon`) sit directly inside `<svg>`, with no groups.
- A `<title>`, `<desc>` or `<metadata>` left by an editor is fine; the build removes it.
- No fills other than `none` or `currentColor`, no stroke colours and no inline styles, on the shapes or on `<svg>`.

See Lucide's [icon design guide](https://lucide.dev/contribute/icon-design-guide) for the drawing rules themselves.
