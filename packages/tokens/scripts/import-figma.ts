/**
 * Turns the designer's Figma variable exports (`figma/*.tokens.json`) into
 * clean DTCG source files (`src/**\/*.figma.tokens.json`).
 *
 * The `*.figma.tokens.json` files are generated: do not edit them by hand.
 * When the designer sends new exports, replace the files in `figma/` and run
 * `pnpm import:figma && pnpm generate:ramps`.
 *
 * What it changes:
 * - drops Figma's `$extensions` (variable ids, scopes, `--sds-*` code names)
 * - restores aliases: Figma exports the resolved colour plus the name of the
 *   variable it points at, and we want the reference (`{color.warm-grey.50}`)
 * - moves primitive colours under a `color` group
 * - gives numbers a unit (Figma exports bare pixel numbers)
 * - rounds Figma's float32 noise (0.03999999910593033 becomes 0.04)
 */
import { join } from "node:path";

import { color, isToken, readJson, root, writeJson } from "./lib.ts";
import type { Token, TokenTree } from "./lib.ts";

type FigmaAlias = {
	targetVariableName: string;
	targetVariableSetName: string;
};

type FigmaColor = { hex: string; alpha: number };

/** Groups whose numbers are lengths in pixels. */
const DIMENSION_GROUPS = new Set([
	"space",
	"radius",
	"border-width",
	"size",
	"font-size",
	"line-height",
]);

const aliasToReference = (alias: FigmaAlias): string => {
	const segments = alias.targetVariableName.split("/");
	switch (alias.targetVariableSetName) {
		case "Primitives":
			return `{color.${segments.join(".")}}`;
		case "Brand":
			// "brand/color/accent/600" -> "{brand.accent.600}"
			return `{${segments.filter((segment) => segment !== "color").join(".")}}`;
		default:
			throw new Error(
				`Unknown Figma collection "${alias.targetVariableSetName}" for ${alias.targetVariableName}`,
			);
	}
};

const cleanToken = (token: Token, group: string): Token => {
	const out: Token = { $type: token.$type, $value: token.$value };

	if (token.$type === "color") {
		const alias = token.$extensions?.["com.figma.aliasData"] as
			FigmaAlias | undefined;
		if (alias) {
			out.$value = aliasToReference(alias);
		} else {
			const { hex, alpha } = token.$value as FigmaColor;
			out.$value = color(hex, alpha);
		}
	} else if (DIMENSION_GROUPS.has(group)) {
		out.$type = "dimension";
		if (typeof token.$value === "number") {
			out.$value = { value: token.$value, unit: "px" };
		}
	}

	if (token.$description) out.$description = token.$description;
	return out;
};

const cleanTree = (tree: TokenTree, group?: string): TokenTree => {
	const out: TokenTree = {};
	for (const [key, node] of Object.entries(tree)) {
		if (key.startsWith("$") || typeof node === "string") continue;
		out[key] = isToken(node)
			? cleanToken(node, group ?? key)
			: cleanTree(node, group ?? key);
	}
	return out;
};

const figma = (name: string): TokenTree =>
	readJson(join(root, "figma", `${name}.tokens.json`));

const src = (path: string): string => join(root, "src", path);

// Primitives: colours live at the top level in Figma, typography sits next to them.
const primitives = cleanTree(figma("primitives"));
const TYPOGRAPHY_GROUPS = ["font-size", "line-height", "font-weight"];
const typography: TokenTree = {};
const colors: TokenTree = {};
for (const [key, node] of Object.entries(primitives)) {
	if (TYPOGRAPHY_GROUPS.includes(key)) typography[key] = node;
	else colors[key] = node;
}

writeJson(src("primitive/color.figma.tokens.json"), { color: colors });
writeJson(src("primitive/typography.figma.tokens.json"), typography);
writeJson(
	src("primitive/dimension.figma.tokens.json"),
	cleanTree(figma("sizes")),
);
writeJson(src("themes/light.figma.tokens.json"), cleanTree(figma("light")));
writeJson(src("themes/dark.figma.tokens.json"), cleanTree(figma("dark")));

console.log("Imported Figma exports into src/**/*.figma.tokens.json");
