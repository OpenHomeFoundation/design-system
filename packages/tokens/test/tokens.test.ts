import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { buildAll, cssName } from "../scripts/build.ts";
import {
	contrast,
	isToken,
	RAMP_STEPS,
	readJson,
	root,
	THEMES,
	walk,
} from "../scripts/lib.ts";
import type { Build } from "../scripts/build.ts";
import type { Theme, TokenTree } from "../scripts/lib.ts";

type FigmaColor = { hex: string; alpha: number };

const figma = (name: string): TokenTree =>
	readJson(join(root, "figma", `${name}.tokens.json`));

/** The CSS a Figma colour should come out as. */
const expected = ({ hex, alpha }: FigmaColor): string => {
	if (alpha >= 1) return hex.toLowerCase();
	const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
	return `rgb(${r} ${g} ${b} / ${Number((alpha * 100).toFixed(2))}%)`;
};

let all: Record<string, Record<Theme, Build>>;

beforeAll(async () => {
	execFileSync("node", ["scripts/build.ts"], { cwd: root });
	all = await buildAll();
});

describe("the designer's values", () => {
	it.each(THEMES)("ddb %s theme matches the Figma export exactly", (theme) => {
		const build = all.ddb?.[theme] as Build;
		let checked = 0;
		walk(figma(theme), (path, token) => {
			expect(build.get(path.join("."))?.resolved, path.join(".")).toBe(
				expected(token.$value as FigmaColor),
			);
			checked += 1;
		});
		expect(checked).toBeGreaterThan(60);
	});

	it("keeps every primitive colour", () => {
		const build = all.ddb?.light as Build;
		walk(figma("primitives"), (path, token) => {
			if (token.$type !== "color") return;
			expect(build.get(["color", ...path].join("."))?.resolved).toBe(
				expected(token.$value as FigmaColor),
			);
		});
	});

	it("keeps every size, in pixels", () => {
		const build = all.ddb?.light as Build;
		walk(figma("sizes"), (path, token) => {
			if (typeof token.$value !== "number") return;
			const value = token.$value === 0 ? "0" : `${token.$value}px`;
			expect(build.get(path.join("."))?.resolved, path.join(".")).toBe(value);
		});
	});
});

describe("themes and brands", () => {
	it("light and dark define the same tokens", () => {
		for (const builds of Object.values(all)) {
			expect([...builds.dark.keys()]).toEqual([...builds.light.keys()]);
		}
	});

	it("every brand defines the same tokens", () => {
		const [first, ...rest] = Object.values(all);
		for (const builds of rest) {
			expect([...builds.light.keys()].sort()).toEqual(
				[...(first?.light.keys() ?? [])].sort(),
			);
		}
	});

	it.each(["ohf", "ddb"])("%s: text on the accent passes WCAG AA", (brand) => {
		for (const theme of THEMES) {
			const build = all[brand]?.[theme] as Build;
			const text = build.get("color.text.on-accent")?.resolved as string;
			for (const state of ["default", "hover", "pressed"]) {
				const bg = build.get(`color.bg.accent.${state}`)?.resolved as string;
				expect(
					contrast(text, bg),
					`${brand} ${theme} ${state}: ${text} on ${bg}`,
				).toBeGreaterThanOrEqual(4.5);
			}
		}
	});
});

describe("colour ramps", () => {
	it("every ramp has all eleven steps", () => {
		const colors = [
			"primitive/color.figma.tokens.json",
			"primitive/color.ramps.tokens.json",
		].map((file) => readJson(join(root, "src", file)).color as TokenTree);
		const hues = [
			"green", "red", "amber", "violet", "teal", "blue",
			"grey", "warm-grey", "light-blue", "dark-blue", "blue-grey",
		];
		for (const hue of hues) {
			for (const step of RAMP_STEPS) {
				const found = colors.some((tree) =>
					isToken((tree[hue] as TokenTree | undefined)?.[step]),
				);
				expect(found, `${hue}.${step}`).toBe(true);
			}
		}
	});

	it("brand accent 500 of ohf is OHF Light Blue", () => {
		expect(all.ohf?.light.get("brand.accent.500")?.resolved).toBe("#18bcf2");
		expect(all.ohf?.light.get("color.ohf.dark-blue")?.resolved).toBe("#09293b");
	});
});

describe("CSS output", () => {
	const css = (file: string): string =>
		readFileSync(join(root, "dist/css", file), "utf8");

	it("only refers to custom properties that tokens.css defines", () => {
		const base = css("tokens.css");
		const defined = new Set(
			[...base.matchAll(/^\t(--[\w-]+):/gm)].map((match) => match[1]),
		);
		for (const file of ["tokens.css", "themes/dark.css", "brands/ddb.css"]) {
			for (const [, name] of css(file).matchAll(/var\((--[\w-]+)\)/g)) {
				expect(defined.has(name), `${file}: ${name}`).toBe(true);
			}
		}
	});

	it("declares every token on :root", () => {
		const base = css("tokens.css");
		for (const token of (all.ohf?.light as Build).values()) {
			expect(base).toContain(`\t${cssName(token.path)}: ${token.css};`);
		}
	});

	it("dark.css follows the system only when data-theme is auto", () => {
		const dark = css("themes/dark.css");
		expect(dark).toContain('[data-theme="dark"] {');
		expect(dark).toMatch(
			/@media \(prefers-color-scheme: dark\) \{\n\t\[data-theme="auto"\] \{/,
		);
	});
});
