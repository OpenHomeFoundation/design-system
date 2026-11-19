/**
 * Generates the icon package from SVG files.
 *
 *   Lucide (node_modules/lucide-static) ─┐
 *                                        ├─ collect → validate → parse → write
 *   OHF icons (src/custom/*.svg) ────────┘
 *
 *   dist/icons/<name>.js   one module per icon, exporting its shapes
 *   dist/index.js          re-exports every icon by name (tree-shakeable)
 *   dist/svg/<name>.svg    plain SVG files
 *   dist/sprite.svg        every icon as a <symbol>
 *   dist/icons.json        names, tags, aliases and where each icon came from
 *
 * The hand-written modules in `src/` (SVG helper, Lit element) are compiled by
 * `tsc` after this script runs.
 */
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { optimize } from "svgo";
import type { CustomPlugin } from "svgo";

import { iconToSvg, iconToSvgContent } from "../src/to-svg.ts";
import type { IconNode } from "../src/types.ts";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export type Icon = {
	/** kebab-case name, for example `arrow-left`. */
	name: string;
	/** Name of the JavaScript export, for example `iconArrowLeft`. */
	exportName: string;
	node: IconNode;
	tags: string[];
	/** Older names that still work but are deprecated. */
	aliases: string[];
	source: "lucide" | "ohf";
};

type Metadata = { tags?: string[]; aliases?: string[] };

// --------------------------------------------------------------- naming

/**
 * Names start with a letter because they become JavaScript identifiers: a
 * Vue component cannot be called `3dProbe`.
 */
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** `arrow-left` becomes `iconArrowLeft`, `grid-2x2` becomes `iconGrid2x2`. */
export const exportName = (name: string): string =>
	`icon${name
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("")}`;

/** `arrow-left` becomes `ArrowLeft`, the Vue component name (as in `@lucide/vue`). */
export const componentName = (name: string): string =>
	exportName(name).slice("icon".length);

// -------------------------------------------------------------- parsing

/** Elements editors add that draw nothing. The build drops them. */
const EDITOR_ELEMENTS = new Set(["title", "desc", "metadata"]);

type SvgElement = {
	type: string;
	name: string;
	attributes: Record<string, string>;
	children: SvgElement[];
};

export type ParsedSvg = {
	attributes: Record<string, string>;
	node: IconNode;
	/** Elements nested inside a shape or group, which icons may not have. */
	nested: string[];
};

/**
 * Parses an SVG with SVGO and reads the result out of its syntax tree.
 * With `optimise`, SVGO also cleans the file first (editor metadata, comments,
 * redundant attributes) without changing what is drawn.
 */
export const parseSvg = (svg: string, optimise = false): ParsedSvg => {
	let parsed: ParsedSvg | undefined;
	const capture: CustomPlugin = {
		name: "capture",
		fn: () => ({
			root: {
				exit: (rootNode) => {
					const element = (rootNode.children as SvgElement[]).find(
						(child) => child.type === "element" && child.name === "svg",
					);
					if (!element) return;
					const shapes = element.children.filter(
						(child) => child.type === "element",
					);
					parsed = {
						attributes: { ...element.attributes },
						node: shapes.map((shape) => [shape.name, { ...shape.attributes }]),
						nested: shapes
							.filter((shape) => !EDITOR_ELEMENTS.has(shape.name))
							.flatMap((shape) =>
							shape.children
								.filter((child) => child.type === "element")
								.map((child) => `${shape.name} > ${child.name}`),
						),
					};
				},
			},
		}),
	};
	optimize(svg, {
		plugins: optimise
			? [
					{
						name: "preset-default",
						params: {
							overrides: {
								// Keep each shape as drawn so icons stay easy to review.
								convertShapeToPath: false,
								mergePaths: false,
							},
						},
					},
					capture,
				]
			: [capture],
	});
	if (!parsed) throw new Error("No <svg> element found");
	return parsed;
};

// ----------------------------------------------------------- validation

const SHAPES = new Set([
	"path",
	"circle",
	"rect",
	"line",
	"ellipse",
	"polyline",
	"polygon",
]);

/** What the `<svg>` element of an OHF icon must say, matching Lucide. */
const REQUIRED = {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	"stroke-width": "2",
	"stroke-linecap": "round",
	"stroke-linejoin": "round",
} as const;

/** Attributes the `<svg>` element may have. None of them is carried over. */
const ROOT_ATTRIBUTES = new Set([
	...Object.keys(REQUIRED),
	"xmlns",
	"width",
	"height",
	"version",
	"id",
	"class",
]);

/** Namespaced (`xmlns:xlink`, `inkscape:version`) and `data-*` attributes draw nothing. */
const isEditorAttribute = (attribute: string): boolean =>
	attribute.includes(":") || attribute.startsWith("data-");

/**
 * Checks an OHF icon against Lucide's drawing rules, so the two sets look
 * like one. Returns the list of problems, empty when the icon is fine.
 */
export const validateCustom = (name: string, svg: string): string[] => {
	const problems: string[] = [];
	if (!KEBAB.test(name)) {
		problems.push(
			`name "${name}" must be kebab-case (a-z, 0-9 and hyphens) and start with a letter`,
		);
	}
	let parsed: ParsedSvg;
	try {
		parsed = parseSvg(svg);
	} catch (error) {
		return [...problems, `not a valid SVG: ${(error as Error).message}`];
	}
	for (const [attribute, value] of Object.entries(REQUIRED)) {
		if (parsed.attributes[attribute] !== value) {
			problems.push(
				`<svg> needs ${attribute}="${value}" (found ${JSON.stringify(parsed.attributes[attribute])})`,
			);
		}
	}
	// Only the shapes are kept, so anything on <svg> that changes the drawing
	// (a style, opacity, a transform) would be silently lost.
	for (const attribute of Object.keys(parsed.attributes)) {
		if (attribute === "style") {
			problems.push("<svg> has an inline style");
		} else if (!ROOT_ATTRIBUTES.has(attribute) && !isEditorAttribute(attribute)) {
			problems.push(
				`<svg> has ${attribute}="${parsed.attributes[attribute]}", which would be lost; put it on the shapes`,
			);
		}
	}
	if (!parsed.node.some(([tag]) => SHAPES.has(tag))) problems.push("has no shapes");
	for (const nested of parsed.nested) {
		problems.push(`shapes must sit directly inside <svg> (found ${nested})`);
	}
	for (const [tag, attributes] of parsed.node) {
		// Editors add these; the optimiser removes them.
		if (EDITOR_ELEMENTS.has(tag)) continue;
		if (!SHAPES.has(tag)) {
			problems.push(`<${tag}> is not allowed; use ${[...SHAPES].join(", ")}`);
		}
		const { fill, style, stroke } = attributes;
		if (fill !== undefined && fill !== "none" && fill !== "currentColor") {
			problems.push(`<${tag}> has fill="${fill}"; only none or currentColor`);
		}
		if (stroke !== undefined && stroke !== "currentColor") {
			problems.push(`<${tag}> has stroke="${stroke}"; colours come from CSS`);
		}
		if (style !== undefined) problems.push(`<${tag}> has an inline style`);
	}
	return problems;
};

// ----------------------------------------------------------- collecting

const require = createRequire(import.meta.url);
const lucideRoot = dirname(require.resolve("lucide-static/package.json"));

export const lucideVersion = (): string =>
	(
		JSON.parse(readFileSync(join(lucideRoot, "package.json"), "utf8")) as {
			version: string;
		}
	).version;

const svgNames = (dir: string): string[] =>
	existsSync(dir)
		? readdirSync(dir)
				.filter((file) => file.endsWith(".svg"))
				.map((file) => basename(file, ".svg"))
				.sort()
		: [];

/**
 * Lucide's current icons are the keys of its `tags.json`. Its `icons/` folder
 * also holds a copy of each icon under every older name it has had; those
 * become deprecated aliases.
 */
export const collectLucide = (): Icon[] => {
	const tags = JSON.parse(
		readFileSync(join(lucideRoot, "tags.json"), "utf8"),
	) as Record<string, string[]>;
	const dir = join(lucideRoot, "icons");
	const drawing = (name: string): string =>
		JSON.stringify(parseSvg(readFileSync(join(dir, `${name}.svg`), "utf8")).node);

	const icons = new Map<string, Icon>();
	const byDrawing = new Map<string, Icon>();
	for (const name of Object.keys(tags).sort()) {
		const key = drawing(name);
		const icon: Icon = {
			name,
			exportName: exportName(name),
			node: JSON.parse(key) as IconNode,
			tags: tags[name] ?? [],
			aliases: [],
			source: "lucide",
		};
		icons.set(name, icon);
		byDrawing.set(key, icon);
	}
	for (const name of svgNames(dir)) {
		if (icons.has(name)) continue;
		const target = byDrawing.get(drawing(name));
		if (!target) {
			throw new Error(`Lucide file ${name}.svg matches no current icon`);
		}
		target.aliases.push(name);
	}
	return [...icons.values()];
};

/** OHF's own icons: `<name>.svg` with an optional `<name>.json` beside it. */
export const collectCustom = (dir = join(root, "src/custom")): Icon[] => {
	const errors: string[] = [];
	const icons = svgNames(dir).map((name): Icon => {
		const svg = readFileSync(join(dir, `${name}.svg`), "utf8");
		errors.push(
			...validateCustom(name, svg).map((problem) => `${name}.svg: ${problem}`),
		);
		const metadataPath = join(dir, `${name}.json`);
		const metadata = existsSync(metadataPath)
			? (JSON.parse(readFileSync(metadataPath, "utf8")) as Metadata)
			: {};
		for (const alias of metadata.aliases ?? []) {
			if (!KEBAB.test(alias)) {
				errors.push(
					`${name}.json: alias "${alias}" must be kebab-case (a-z, 0-9 and hyphens) and start with a letter`,
				);
			}
		}
		let node: IconNode = [];
		try {
			node = parseSvg(svg, true).node.filter(([tag]) => SHAPES.has(tag));
		} catch {
			// validateCustom has already reported it.
		}
		return {
			name,
			exportName: exportName(name),
			node,
			tags: metadata.tags ?? [],
			aliases: metadata.aliases ?? [],
			source: "ohf",
		};
	});
	if (errors.length > 0) {
		throw new Error(`Invalid OHF icons:\n  ${errors.join("\n  ")}`);
	}
	return icons;
};

/** Every icon, with a check that no name or export is used twice. */
export const collect = (customDir?: string): Icon[] => {
	const icons = [...collectLucide(), ...collectCustom(customDir)];
	const names = new Map<string, string>();
	// The index also exports these helpers, so no icon may take their names.
	const exports = new Map<string, string>([
		["iconToSvg", "the iconToSvg helper"],
		["iconToSvgContent", "the iconToSvgContent helper"],
	]);
	const claim = (map: Map<string, string>, key: string, owner: string) => {
		const existing = map.get(key);
		if (existing && existing !== owner) {
			throw new Error(`"${key}" is used by both ${existing} and ${owner}`);
		}
		map.set(key, owner);
	};
	for (const icon of icons) {
		const owner = `${icon.source} icon ${icon.name}`;
		for (const name of [icon.name, ...icon.aliases]) {
			if (!KEBAB.test(name)) {
				throw new Error(
					`${owner}: "${name}" cannot be turned into a JavaScript export name`,
				);
			}
			claim(names, name, owner);
			claim(exports, exportName(name), owner);
		}
	}
	return icons.sort((a, b) => a.name.localeCompare(b.name));
};

// -------------------------------------------------------------- writing

const HEADER = "// Generated by @openhomefoundation/icons. Do not edit.\n";

const write = (path: string, content: string): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
};

export const generate = (
	icons: Icon[],
	dist = join(root, "dist"),
): void => {
	let index = HEADER;
	let types =
		HEADER +
		'export type { IconNode } from "./types.js";\n' +
		'export * from "./to-svg.js";\n';
	index += 'export * from "./to-svg.js";\n';

	// Vue: every component in one module. The PURE marks tell a bundler that an
	// unused component, and the icon it imports, can be dropped.
	let vue =
		HEADER +
		'import { createIcon } from "./create-icon.js";\n';
	let vueExports = "";
	let vueTypes =
		HEADER +
		'import type { IconComponent } from "./create-icon.js";\n' +
		'export type { IconComponent, IconProps } from "./create-icon.js";\n' +
		'export { createIcon } from "./create-icon.js";\n';

	const symbols: string[] = [];
	for (const icon of icons) {
		const { name, exportName: exported } = icon;
		write(
			join(dist, `icons/${name}.js`),
			`${HEADER}export const ${exported} = ${JSON.stringify(icon.node)};\n`,
		);
		write(
			join(dist, `icons/${name}.d.ts`),
			`${HEADER}import type { IconNode } from "../types.js";\n` +
				`/** \`${name}\` */\nexport declare const ${exported}: IconNode;\n`,
		);
		write(join(dist, `svg/${name}.svg`), `${iconToSvg(icon.node)}\n`);
		symbols.push(
			`<symbol id="${name}" viewBox="0 0 24 24">${iconToSvgContent(icon.node)}</symbol>`,
		);

		const from = `"./icons/${name}.js"`;
		index += `export { ${exported} } from ${from};\n`;
		types += `export { ${exported} } from ${from};\n`;
		// Some old names only differ by a hyphen (arrow-up-10, arrow-up-1-0) and
		// give the same export, so there is nothing to alias.
		const aliasExports = new Set(icon.aliases.map(exportName));
		aliasExports.delete(exported);
		for (const aliasExport of aliasExports) {
			index += `export { ${exported} as ${aliasExport} } from ${from};\n`;
			types +=
				`export {\n\t/** @deprecated Renamed to \`${exported}\`. */\n` +
				`\t${exported} as ${aliasExport},\n} from ${from};\n`;
		}

		const component = componentName(name);
		vue += `import { ${exported} } from "../icons/${name}.js";\n`;
		vueExports += `export const ${component} = /*#__PURE__*/ createIcon("${name}", ${exported});\n`;
		vueTypes += `/** \`${name}\` */\nexport declare const ${component}: IconComponent;\n`;
		for (const aliasExport of aliasExports) {
			const alias = aliasExport.slice("icon".length);
			vueExports += `export { ${component} as ${alias} };\n`;
			vueTypes += `/** @deprecated Renamed to \`${component}\`. */\nexport declare const ${alias}: IconComponent;\n`;
		}
	}
	write(
		join(dist, "vue/index.js"),
		`${vue}export { createIcon };\n${vueExports}`,
	);
	write(join(dist, "vue/index.d.ts"), vueTypes);
	write(join(dist, "index.js"), index);
	write(join(dist, "index.d.ts"), types);

	// Colours and stroke are set by whoever uses the symbol:
	// <svg fill="none" stroke="currentColor" stroke-width="2" …><use href="sprite.svg#house"/></svg>
	write(
		join(dist, "sprite.svg"),
		`<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n${symbols.join("\n")}\n</svg>\n`,
	);

	// One icon per line keeps the file small and its diffs readable.
	const entries = icons.map(({ name, exportName: exported, tags, aliases, source }) =>
		JSON.stringify({
			name,
			export: exported,
			source,
			tags,
			...(aliases.length > 0 ? { aliases } : {}),
		}),
	);
	write(
		join(dist, "icons.json"),
		`{"lucideVersion":${JSON.stringify(lucideVersion())},"icons":[\n${entries.join(",\n")}\n]}\n`,
	);

	// Lucide's licence has to travel with copies of its icons.
	copyFileSync(join(lucideRoot, "LICENSE"), join(dist, "LICENSE-lucide"));
};

// Run only when this file is the script Node was started with.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	rmSync(join(root, "dist"), { recursive: true, force: true });
	const icons = collect();
	generate(icons);
	const custom = icons.filter((icon) => icon.source === "ohf").length;
	console.log(
		`Generated ${icons.length} icons (Lucide ${lucideVersion()}: ${icons.length - custom}, OHF: ${custom})`,
	);
}
