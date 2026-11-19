/**
 * Builds `dist/` from the DTCG source in `src/`.
 *
 *   dist/css/tokens.css         every token, light theme, default brand
 *   dist/css/themes/dark.css    what changes in the dark theme
 *   dist/css/brands/<name>.css  what changes for another brand
 *   dist/js/index.js            one named export per token (resolved value)
 *   dist/js/vars.js             one named export per token (`var(--ohf-…)`)
 *   dist/json/tokens.json       every brand and theme, resolved, for docs and Figma
 *
 * Style Dictionary resolves the references. This script decides which tokens
 * go into which file and writes them.
 */
import { rmSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import StyleDictionary from "style-dictionary";

import {
	DEFAULT_BRAND,
	isToken,
	merge,
	PREFIX,
	readJson,
	root,
	THEMES,
	tokenFiles,
	writeJson,
	writeText,
} from "./lib.ts";
import type { ColorValue, Theme, TokenTree } from "./lib.ts";

export type BuiltToken = {
	/** Dotted path, for example `color.bg.canvas`. */
	id: string;
	path: string[];
	type: string;
	description?: string;
	/** The token this one points at, when its whole value is a reference. */
	reference?: string;
	/** CSS value that keeps references as `var(--ohf-…)`. */
	css: string;
	/** CSS value with every reference resolved. */
	resolved: string;
};

export type Build = Map<string, BuiltToken>;

// --------------------------------------------------------------- naming

export const cssName = (path: string[]): string =>
	`--${PREFIX}-${path.join("-")}`;

/** `color.warm-grey.50` becomes `colorWarmGrey50`, `color.alpha.7-2` becomes `colorAlpha7_2`. */
export const jsName = (path: string[]): string =>
	path
		.flatMap((segment) => segment.split("-"))
		.reduce((name, part) => {
			if (name === "") return part;
			if (/\d$/.test(name) && /^\d/.test(part)) return `${name}_${part}`;
			return name + part.charAt(0).toUpperCase() + part.slice(1);
		}, "");

// --------------------------------------------------------------- values

const REFERENCE = /^\{([^{}]+)\}$/;

/** Groups whose lengths are written in rem so they follow the user's font size. */
const REM_GROUPS = new Set(["font-size", "line-height"]);

type Dimension = { value: number; unit: string };
type Shadow = {
	color: unknown;
	offsetX: Dimension;
	offsetY: Dimension;
	blur: Dimension;
	spread: Dimension;
};

const number = (value: number): string => String(Number(value.toFixed(4)));

const cssColor = ({ hex, components, alpha = 1 }: ColorValue): string => {
	if (alpha >= 1) return hex;
	const [r, g, b] = components.map((channel) => Math.round(channel * 255));
	return `rgb(${r} ${g} ${b} / ${number(alpha * 100)}%)`;
};

const cssDimension = ({ value, unit }: Dimension, rem = false): string => {
	if (value === 0) return "0";
	return rem && unit === "px"
		? `${number(value / 16)}rem`
		: `${number(value)}${unit}`;
};

const cssFontFamily = (value: string | string[]): string =>
	[value]
		.flat()
		.map((family) => (/\s/.test(family) ? `"${family}"` : family))
		.join(", ");

/**
 * @param raw   the value as written in the source, references intact
 * @param value the same value with references resolved
 */
const cssValue = (
	path: string[],
	type: string,
	raw: unknown,
	value: unknown,
	keepReferences: boolean,
): string => {
	if (keepReferences && typeof raw === "string") {
		const reference = REFERENCE.exec(raw);
		if (reference) return `var(${cssName((reference[1] as string).split("."))})`;
	}
	switch (type) {
		case "color":
			return cssColor(value as ColorValue);
		case "dimension":
			return cssDimension(value as Dimension, REM_GROUPS.has(path[0] ?? ""));
		case "duration": {
			// Unlike lengths, a time of zero still needs its unit.
			const { value: time, unit } = value as Dimension;
			return `${number(time)}${unit}`;
		}
		case "number":
		case "fontWeight":
			return String(value);
		case "fontFamily":
			return cssFontFamily(value as string | string[]);
		case "cubicBezier":
			return `cubic-bezier(${(value as number[]).join(", ")})`;
		case "shadow": {
			const rawLayers = [raw].flat() as Shadow[];
			return ([value].flat() as Shadow[])
				.map((layer, index) =>
					[
						cssDimension(layer.offsetX),
						cssDimension(layer.offsetY),
						cssDimension(layer.blur),
						cssDimension(layer.spread),
						cssValue(
							path,
							"color",
							rawLayers[index]?.color,
							layer.color,
							keepReferences,
						),
					].join(" "),
				)
				.join(", ");
		}
		default:
			throw new Error(`${path.join(".")}: no CSS output for type "${type}"`);
	}
};

// --------------------------------------------------------------- source

/** Drops group-level `$description` and friends, which are notes for people. */
const stripNotes = (tree: TokenTree): TokenTree =>
	Object.fromEntries(
		Object.entries(tree)
			.filter(([key]) => !key.startsWith("$"))
			.map(([key, node]) => [
				key,
				typeof node === "string" || isToken(node) ? node : stripNotes(node),
			]),
	);

const load = (dir: string): TokenTree =>
	merge(...tokenFiles(join(root, "src", dir)).map((file) => readJson(file)));

export const brandNames = (): string[] =>
	tokenFiles(join(root, "src/brands")).map((file) =>
		basename(file, ".tokens.json"),
	);

/** Resolves one brand in one theme. */
export const resolve = async (brand: string, theme: Theme): Promise<Build> => {
	const tokens = stripNotes(
		merge(
			load("primitive"),
			readJson(join(root, `src/themes/${theme}.figma.tokens.json`)),
			readJson(join(root, `src/brands/${brand}.tokens.json`)),
		),
	);
	const dictionary = new StyleDictionary({
		tokens: tokens as never,
		usesDtcg: true,
		log: { verbosity: "silent", warnings: "error" },
		platforms: { resolved: { transforms: [] } },
	});
	const { allTokens } = await dictionary.getPlatformTokens("resolved");

	const build: Build = new Map();
	for (const token of allTokens) {
		const { path } = token;
		const type = token.$type;
		if (!type) throw new Error(`${path.join(".")} has no $type`);
		const raw = token.original.$value as unknown;
		const reference =
			typeof raw === "string" ? REFERENCE.exec(raw)?.[1] : undefined;
		build.set(path.join("."), {
			id: path.join("."),
			path,
			type,
			...(token.$description ? { description: token.$description } : {}),
			...(reference ? { reference } : {}),
			css: cssValue(path, type, raw, token.$value, true),
			resolved: cssValue(path, type, raw, token.$value, false),
		});
	}
	return build;
};

// ------------------------------------------------------------------ CSS

const same = (a: BuiltToken | undefined, b: BuiltToken | undefined): boolean =>
	a?.css === b?.css && a?.resolved === b?.resolved;

/** Tokens of `build` that differ from `base`. */
const diff = (build: Build, base: Build): BuiltToken[] =>
	[...build.values()].filter((token) => !same(token, base.get(token.id)));

const rule = (
	selector: string,
	tokens: BuiltToken[],
	extra: string[] = [],
	indent = "",
): string => {
	const lines = [
		...extra,
		...tokens.map((token) => `${cssName(token.path)}: ${token.css};`),
	];
	return `${indent}${selector} {\n${lines
		.map((line) => `${indent}\t${line}\n`)
		.join("")}${indent}}\n`;
};

const media = (selector: string, tokens: BuiltToken[], extra: string[] = []) =>
	`@media (prefers-color-scheme: dark) {\n${rule(selector, tokens, extra, "\t")}}\n`;

const banner = (text: string): string =>
	`/**\n${text
		.split("\n")
		.map((line) => ` * ${line}`.trimEnd())
		.join("\n")}\n * Generated by @openhomefoundation/tokens. Do not edit.\n */\n\n`;

const baseCss = (light: Build, dark: Build): string => {
	const themed = diff(light, dark);
	return (
		banner(
			"Every token, in the light theme and the default brand.\n" +
				'Set data-theme="light | dark | auto" and data-brand on <html>.',
		) +
		rule(":root", [...light.values()], ["color-scheme: light;"]) +
		"\n" +
		// Lets a light region sit inside a dark page. "auto" is reset too, so an
		// auto region follows the system even there; dark.css turns it dark again
		// when the system prefers dark.
		rule('[data-theme="light"],\n[data-theme="auto"]', themed, [
			"color-scheme: light;",
		])
	);
};

const darkCss = (light: Build, dark: Build): string => {
	const themed = diff(dark, light);
	return (
		banner(
			'The dark theme. Applies with data-theme="dark", or with\n' +
				'data-theme="auto" when the system prefers dark.',
		) +
		rule('[data-theme="dark"]', themed, ["color-scheme: dark;"]) +
		"\n" +
		media('[data-theme="auto"]', themed, ["color-scheme: dark;"])
	);
};

const brandCss = (
	brand: string,
	builds: Record<Theme, Build>,
	base: Record<Theme, Build>,
): string => {
	const brandLight = diff(builds.light, base.light);
	const inBrandRule = new Set(brandLight.map((token) => token.id));
	const inDarkRule = new Set(diff(base.dark, base.light).map((t) => t.id));

	// Without a rule for brand and dark together, a token would take its value
	// from the brand rule, the dark rule or :root. Add one where that is wrong,
	// and where both rules set the token and source order would decide.
	const brandDark = [...builds.dark.values()].filter((token) => {
		const { id } = token;
		if (inBrandRule.has(id) && inDarkRule.has(id)) return true;
		if (inBrandRule.has(id)) return !same(token, builds.light.get(id));
		if (inDarkRule.has(id)) return !same(token, base.dark.get(id));
		return !same(token, base.light.get(id));
	});

	const selector = `[data-brand="${brand}"]`;
	let css =
		banner(`The ${brand} brand. Applies with data-brand="${brand}".`) +
		rule(selector, brandLight);
	if (brandDark.length > 0) {
		css +=
			"\n" +
			rule(`${selector}[data-theme="dark"]`, brandDark) +
			"\n" +
			media(`${selector}[data-theme="auto"]`, brandDark);
	}
	return css;
};

// ------------------------------------------------------------------- JS

const jsModule = (
	build: Build,
	value: (token: BuiltToken) => string,
	literalTypes: boolean,
): { js: string; dts: string } => {
	const names = new Map<string, string>();
	let js = "// Generated by @openhomefoundation/tokens. Do not edit.\n";
	let dts = js;
	for (const token of build.values()) {
		const name = jsName(token.path);
		const clash = names.get(name);
		if (clash) throw new Error(`${token.id} and ${clash} both export ${name}`);
		names.set(name, token.id);

		const literal = JSON.stringify(value(token));
		const doc = `/** ${[`\`${token.id}\``, token.description]
			.filter(Boolean)
			.join(": ")
			.replaceAll("*/", "*\\/")} */\n`;
		js += `export const ${name} = ${literal};\n`;
		dts += `${doc}export declare const ${name}: ${literalTypes ? literal : "string"};\n`;
	}
	return { js, dts };
};

// ----------------------------------------------------------------- main

export const buildAll = async (): Promise<
	Record<string, Record<Theme, Build>>
> => {
	const all: Record<string, Record<Theme, Build>> = {};
	for (const brand of brandNames()) {
		all[brand] = {
			light: await resolve(brand, "light"),
			dark: await resolve(brand, "dark"),
		};
	}
	return all;
};

const main = async (): Promise<void> => {
	const dist = join(root, "dist");
	rmSync(dist, { recursive: true, force: true });

	const all = await buildAll();
	const base = all[DEFAULT_BRAND];
	if (!base) throw new Error(`No src/brands/${DEFAULT_BRAND}.tokens.json`);

	writeText(join(dist, "css/tokens.css"), baseCss(base.light, base.dark));
	writeText(join(dist, "css/themes/dark.css"), darkCss(base.light, base.dark));
	for (const [brand, builds] of Object.entries(all)) {
		if (brand === DEFAULT_BRAND) continue;
		writeText(
			join(dist, `css/brands/${brand}.css`),
			brandCss(brand, builds, base),
		);
	}

	const values = jsModule(base.light, (token) => token.resolved, false);
	writeText(join(dist, "js/index.js"), values.js);
	writeText(join(dist, "js/index.d.ts"), values.dts);
	const vars = jsModule(
		base.light,
		(token) => `var(${cssName(token.path)})`,
		true,
	);
	writeText(join(dist, "js/vars.js"), vars.js);
	writeText(join(dist, "js/vars.d.ts"), vars.dts);

	writeJson(
		join(dist, "json/tokens.json"),
		Object.fromEntries(
			Object.entries(all).map(([brand, builds]) => [
				brand,
				Object.fromEntries(
					THEMES.map((theme) => [
						theme,
						Object.fromEntries(
							[...builds[theme].values()].map((token) => [
								token.id,
								{
									type: token.type,
									value: token.resolved,
									cssVar: cssName(token.path),
									...(token.reference ? { reference: token.reference } : {}),
									...(token.description
										? { description: token.description }
										: {}),
								},
							]),
						),
					]),
				),
			]),
		),
	);

	console.log(
		`Built ${base.light.size} tokens for ${Object.keys(all).join(", ")} into dist/`,
	);
};

// Run only when this file is the script Node was started with. The test
// suite imports it for its functions.
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
