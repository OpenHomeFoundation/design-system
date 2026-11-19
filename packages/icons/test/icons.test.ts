import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rolldown } from "rolldown";
import { beforeAll, describe, expect, it } from "vitest";

import {
	collect,
	collectCustom,
	exportName,
	generate,
	root,
	validateCustom,
} from "../scripts/build.ts";
import { iconToSvg } from "../src/to-svg.ts";
import type { IconNode } from "../src/types.ts";

const require = createRequire(import.meta.url);
const fixtures = join(root, "test/fixtures");
const dist = (path: string): string => join(root, "dist", path);

beforeAll(() => {
	execFileSync("pnpm", ["build"], { cwd: root });
}, 60_000);

describe("names", () => {
	it("turns kebab-case into an icon export", () => {
		expect(exportName("house")).toBe("iconHouse");
		expect(exportName("arrow-up-1-0")).toBe("iconArrowUp10");
		expect(exportName("grid-2x2")).toBe("iconGrid2x2");
	});
});

describe("Lucide icons", () => {
	it("match Lucide's own icon data exactly", async () => {
		const lucide = require("lucide-static/icon-nodes.json") as Record<
			string,
			IconNode
		>;
		const ours = (await import(dist("index.js"))) as Record<string, IconNode>;
		expect(Object.keys(lucide).length).toBeGreaterThan(2000);
		for (const [name, node] of Object.entries(lucide)) {
			expect(ours[exportName(name)], name).toEqual(node);
		}
	});

	it("lose nothing to the renderers' attribute allowlist", async () => {
		const ours = (await import(dist("index.js"))) as Record<string, unknown>;
		const { safeShapes } = ours as unknown as {
			safeShapes: (icon: IconNode) => unknown;
		};
		for (const [name, node] of Object.entries(ours)) {
			if (!Array.isArray(node)) continue;
			expect(safeShapes(node as IconNode), name).toEqual(node);
		}
	});

	it("keep renamed icons available under their old name", async () => {
		const ours = (await import(dist("index.js"))) as Record<string, IconNode>;
		expect(ours.iconHome).toBe(ours.iconHouse);
		expect(readFileSync(dist("index.d.ts"), "utf8")).toContain(
			"@deprecated Renamed to `iconHouse`",
		);
	});

	it("ship Lucide's licence", () => {
		expect(readFileSync(dist("LICENSE-lucide"), "utf8")).toContain("ISC License");
	});
});

describe("OHF icons", () => {
	it("accepts an icon drawn to Lucide's rules and cleans it", () => {
		const [icon] = collectCustom(join(fixtures, "valid"));
		expect(icon).toMatchObject({
			name: "test-probe",
			exportName: "iconTestProbe",
			source: "ohf",
			tags: ["test", "probe"],
			aliases: ["test-old-probe"],
			// The editor's <title> and comment are gone, the shapes are untouched.
			node: [
				["circle", { cx: "12", cy: "12", r: "9" }],
				["path", { d: "M12 7v10" }],
			],
		});
	});

	it("goes through the same generator as Lucide icons", async () => {
		const out = mkdtempSync(join(tmpdir(), "ohf-icons-"));
		const icons = collect(join(fixtures, "valid"));
		generate(icons, out);
		expect(icons).toHaveLength(
			Object.keys(require("lucide-static/tags.json") as object).length + 1,
		);
		expect(readFileSync(join(out, "svg/test-probe.svg"), "utf8")).toContain(
			'<circle cx="12" cy="12" r="9"/>',
		);
		const index = readFileSync(join(out, "index.js"), "utf8");
		expect(index).toContain(
			'export { iconTestProbe } from "./icons/test-probe.js";',
		);
		expect(index).toContain("iconTestProbe as iconTestOldProbe");
		expect(readFileSync(join(out, "icons.json"), "utf8")).toContain(
			'"name":"test-probe","export":"iconTestProbe","source":"ohf"',
		);
	});

	it("explains what is wrong with a badly drawn icon", () => {
		const svg = readFileSync(join(fixtures, "invalid/Bad_Name.svg"), "utf8");
		const problems = validateCustom("Bad_Name", svg).join("\n");
		expect(problems).toContain("must be kebab-case");
		expect(problems).toContain('<svg> needs viewBox="0 0 24 24"');
		expect(problems).toContain('<svg> needs fill="none"');
		expect(problems).toContain('<svg> needs stroke="currentColor"');
		expect(problems).toContain("<g> is not allowed");
		expect(problems).toContain("found g > path");
		expect(problems).toContain('has fill="#ff0000"');
		expect(problems).toContain("<text> is not allowed");
	});

	it("rejects names that cannot become a JavaScript export", () => {
		const svg = readFileSync(join(fixtures, "valid/test-probe.svg"), "utf8");
		expect(validateCustom("3d-probe", svg).join("\n")).toContain(
			"start with a letter",
		);
		const dir = mkdtempSync(join(tmpdir(), "ohf-alias-"));
		writeFileSync(join(dir, "probe-x.svg"), svg);
		writeFileSync(join(dir, "probe-x.json"), '{ "aliases": ["3d-probe"] }');
		expect(() => collectCustom(dir)).toThrow(/alias "3d-probe" must be kebab-case/);
	});

	it("accepts editor metadata with nested elements and drops it", () => {
		const svg = readFileSync(join(fixtures, "valid/test-probe.svg"), "utf8").replace(
			"<title>probe</title>",
			'<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description/></rdf:RDF></metadata>',
		);
		expect(validateCustom("test-probe", svg)).toEqual([]);
		const dir = mkdtempSync(join(tmpdir(), "ohf-meta-"));
		writeFileSync(join(dir, "test-probe.svg"), svg);
		expect(collectCustom(dir)[0]?.node.map(([tag]) => tag)).toEqual(["circle", "path"]);
	});

	it("rejects an inline style on the <svg> element", () => {
		const svg = readFileSync(join(fixtures, "valid/test-probe.svg"), "utf8").replace(
			"<svg ",
			'<svg style="stroke:red" ',
		);
		expect(validateCustom("test-probe", svg)).toEqual(["<svg> has an inline style"]);
	});

	it("rejects attributes on <svg> that would be lost", () => {
		const svg = readFileSync(join(fixtures, "valid/test-probe.svg"), "utf8");
		expect(
			validateCustom("test-probe", svg.replace("<svg ", '<svg opacity="0.5" ')),
		).toEqual(['<svg> has opacity="0.5", which would be lost; put it on the shapes']);
		// Editor and namespace attributes draw nothing, so they are fine.
		expect(
			validateCustom(
				"test-probe",
				svg.replace("<svg ", '<svg xmlns:xlink="http://www.w3.org/1999/xlink" data-name="x" id="a" '),
			),
		).toEqual([]);
	});

	it("rejects a name that would replace a helper export", () => {
		const svg = readFileSync(join(fixtures, "valid/test-probe.svg"), "utf8");
		for (const name of ["to-svg", "to-svg-content"]) {
			const dir = mkdtempSync(join(tmpdir(), "ohf-reserved-"));
			writeFileSync(join(dir, `${name}.svg`), svg);
			expect(() => collect(dir)).toThrow(/is used by both the iconToSvg/);
		}
	});

	it("rejects a name Lucide already uses", () => {
		const dir = mkdtempSync(join(tmpdir(), "ohf-clash-"));
		for (const name of ["house", "home"]) {
			writeFileSync(
				join(dir, `${name}.svg`),
				readFileSync(join(fixtures, "valid/test-probe.svg")),
			);
		}
		expect(() => collect(dir)).toThrow(/"home" is used by both|"house" is used by both/);
	});
});

describe("iconToSvg", () => {
	const icon: IconNode = [["path", { d: "M5 12h14" }]];

	it("hides the icon from screen readers unless it has a label", () => {
		expect(iconToSvg(icon)).toContain('aria-hidden="true"');
		const labelled = iconToSvg(icon, { label: "Next", size: 16, strokeWidth: 1.5 });
		expect(labelled).toContain('role="img" aria-label="Next"');
		expect(labelled).toContain('width="16" height="16"');
		expect(labelled).toContain('stroke-width="1.5"');
		expect(labelled).not.toContain("aria-hidden");
	});

	it("escapes values and drops anything that is not a shape", () => {
		const svg = iconToSvg(
			[
				["script", { src: "x" }],
				["path", { d: '"><script>alert(1)</script>', "on click": "x" }],
			],
			{ label: 'a"b<c' },
		);
		expect(svg).not.toContain("<script");
		for (const handler of ["onmouseover", "ONLOAD", "onClick", "innerHTML", "href"]) {
			const out = iconToSvg([["path", { d: "M0 0", [handler]: "alert(1)" }]]);
			expect(out).toBe(iconToSvg([["path", { d: "M0 0" }]]));
		}
		expect(svg).not.toContain("on click");
		expect(svg).toContain('aria-label="a&quot;b&lt;c"');
	});
});

describe("Vue components", () => {
	const render = async (
		pick: (icons: Record<string, unknown>) => unknown,
		props: Record<string, unknown> = {},
		title?: string,
	): Promise<string> => {
		const { createSSRApp, h } = await import("vue");
		const { renderToString } = await import("vue/server-renderer");
		const icons = (await import(dist("vue/index.js"))) as Record<string, unknown>;
		const slots = title ? { default: () => h("title", title) } : undefined;
		return renderToString(
			createSSRApp({ render: () => h(pick(icons) as never, props, slots) }),
		);
	};

	it("renders an icon with Lucide's defaults, hidden from screen readers", async () => {
		const svg = await render((icons) => icons.House);
		expect(svg).toContain('width="24" height="24" viewBox="0 0 24 24"');
		expect(svg).toContain('stroke="currentColor" stroke-width="2"');
		expect(svg).toContain('aria-hidden="true"');
		expect(svg).toContain('class="ohf-icon ohf-icon-house"');
		expect(svg).toContain('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8">');
	});

	it("takes the same props as @lucide/vue", async () => {
		const svg = await render((icons) => icons.Search, {
			size: 48,
			color: "red",
			strokeWidth: 2,
			absoluteStrokeWidth: true,
			class: "mine",
			"data-test": "x",
		});
		expect(svg).toContain('width="48" height="48"');
		expect(svg).toContain('stroke="red"');
		// 2px on screen at twice the size is 1 on the 24 grid.
		expect(svg).toContain('stroke-width="1"');
		expect(svg).toContain('class="ohf-icon ohf-icon-search mine"');
		expect(svg).toContain('data-test="x"');
	});

	it("is announced when it has a label or a title", async () => {
		const labelled = await render((icons) => icons.X, { "aria-label": "Close" });
		expect(labelled).toContain('role="img"');
		expect(labelled).toContain('aria-label="Close"');
		expect(labelled).not.toContain("aria-hidden");
		const titled = await render((icons) => icons.X, {}, "Close");
		expect(titled).toContain("<title>Close</title>");
		expect(titled).not.toContain("aria-hidden");
	});

	it("is not announced for slot content that is not a title", async () => {
		const { createSSRApp, h, Fragment, Comment } = await import("vue");
		const { renderToString } = await import("vue/server-renderer");
		const { House } = (await import(dist("vue/index.js"))) as Record<string, never>;
		const withSlot = (slot: () => unknown): Promise<string> =>
			renderToString(
				createSSRApp({ render: () => h(House as never, {}, { default: slot }) }),
			);
		// What `<title v-if="false">` leaves behind, an extra shape, an empty title.
		for (const slot of [
			() => [h(Comment as never, "v-if")],
			() => [h("path", { d: "M0 0" })],
			() => [h("title", "  ")],
		]) {
			const svg = await withSlot(slot);
			expect(svg).toContain('aria-hidden="true"');
			expect(svg).not.toContain('role="img"');
		}
		const nested = await withSlot(() => [h(Fragment, [h("title", "Home")])]);
		expect(nested).toContain('role="img"');
		expect(nested).not.toContain("aria-hidden");
	});

	it("drops unsafe tags and attributes from icon data", async () => {
		const { createSSRApp, h } = await import("vue");
		const { renderToString } = await import("vue/server-renderer");
		const { createIcon } = (await import(dist("vue/index.js"))) as {
			createIcon: (name: string, node: unknown) => never;
		};
		const Evil = createIcon("evil", [
			["script", { src: "x" }],
			["path", { d: "M0 0", onmouseover: "alert(1)", innerHTML: "<b>x</b>" }],
		]);
		const svg = await renderToString(createSSRApp({ render: () => h(Evil) }));
		expect(svg).toContain('<path d="M0 0"></path>');
		expect(svg).not.toMatch(/script|onmouseover|<b>/);
	});

	it("has a component for every icon and old name", async () => {
		const icons = (await import(dist("vue/index.js"))) as Record<string, unknown>;
		const data = (await import(dist("index.js"))) as Record<string, unknown>;
		const expected = Object.keys(data)
			.filter((name) => Array.isArray(data[name]))
			.map((name) => name.slice(4))
			.sort();
		expect(Object.keys(icons).filter((name) => name !== "createIcon").sort()).toEqual(expected);
		expect(icons.Home).toBe(icons.House);
	});
});

describe("tree shaking", () => {
	// Installs the package into a throwaway project by symlink, so the bundler
	// resolves it through the real "exports" map like an app would.
	const bundle = async (
		code: string,
		external: RegExp[] = [/^lit/],
	): Promise<string> => {
		const dir = mkdtempSync(join(tmpdir(), "ohf-shake-"));
		mkdirSync(join(dir, "node_modules/@openhomefoundation"), { recursive: true });
		symlinkSync(root, join(dir, "node_modules/@openhomefoundation/icons"));
		const entry = join(dir, "entry.js");
		writeFileSync(entry, code);
		const build = await rolldown({ input: entry, external });
		const { output } = await build.generate({ format: "esm" });
		return output[0].code;
	};

	it("importing one icon from the package root bundles only that icon", async () => {
		const code = await bundle(
			'import { iconHouse } from "@openhomefoundation/icons";\nconsole.log(iconHouse);\n',
		);
		expect(code).toContain("M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8");
		// The whole set is about 600 kB; one icon is a few hundred bytes.
		expect(code.length).toBeLessThan(600);
	});

	it("resolves the documented per-icon import", async () => {
		const code = await bundle(
			'import { iconHouse } from "@openhomefoundation/icons/icons/house.js";\nconsole.log(iconHouse);\n',
		);
		expect(code).toContain("M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8");
	});

	it("importing the Lit helper does not register an element or pull in icons", async () => {
		const code = await bundle(
			'import { iconX } from "@openhomefoundation/icons";\n' +
				'import { renderIcon } from "@openhomefoundation/icons/lit";\n' +
				"console.log(renderIcon(iconX));\n",
		);
		expect(code).not.toContain("customElements.define");
		expect(code).not.toContain("class OhfIcon");
		// One icon plus the renderer; the whole set would be about 600 kB.
		expect(code.length).toBeLessThan(5000);
	});

	it("importing one Vue component bundles only that icon", async () => {
		const code = await bundle(
			'import { House } from "@openhomefoundation/icons/vue";\nconsole.log(House);\n',
			[/^vue/],
		);
		expect(code).toContain("M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8");
		expect(code.match(/createIcon\(/g)).toHaveLength(1);
		// One icon plus the renderer; the whole set would be about 600 kB.
		expect(code.length).toBeLessThan(5000);
	});

	it("declares only the element registration as a side effect", () => {
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
			sideEffects: string[];
		};
		expect(pkg.sideEffects).toEqual(["./dist/lit/define.js"]);
		expect(existsSync(dist("lit/define.js"))).toBe(true);
	});
});
