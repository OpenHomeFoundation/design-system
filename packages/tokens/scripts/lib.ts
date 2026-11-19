import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Prefix of every CSS custom property the package emits. */
export const PREFIX = "ohf";

/** The brand built into `tokens.css`. Other brands ship as override files. */
export const DEFAULT_BRAND = "ohf";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The full step list every colour ramp is filled to. */
export const RAMP_STEPS = [
	50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;

export type ColorValue = {
	colorSpace: "srgb";
	components: [number, number, number];
	alpha?: number;
	hex: string;
};

export type Token = {
	$type?: string;
	$value: unknown;
	$description?: string;
	$extensions?: Record<string, unknown>;
};

export type TokenTree = { [key: string]: TokenTree | Token | string };

export const isToken = (node: unknown): node is Token =>
	typeof node === "object" && node !== null && "$value" in node;

/** Marks a token this repo generated rather than the designer drew. */
export const GENERATED = "org.openhomefoundation.generated";

// ---------------------------------------------------------------- files

export const readJson = <T = TokenTree>(path: string): T =>
	JSON.parse(readFileSync(path, "utf8")) as T;

export const writeJson = (path: string, data: unknown): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
};

export const writeText = (path: string, text: string): void => {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
};

export const tokenFiles = (dir: string): string[] =>
	readdirSync(dir)
		.filter((file) => file.endsWith(".tokens.json"))
		.sort()
		.map((file) => join(dir, file));

// ---------------------------------------------------------------- trees

export const walk = (
	tree: TokenTree,
	visit: (path: string[], token: Token) => void,
	path: string[] = [],
): void => {
	for (const [key, node] of Object.entries(tree)) {
		if (key.startsWith("$") || typeof node === "string") continue;
		if (isToken(node)) visit([...path, key], node);
		else walk(node, visit, [...path, key]);
	}
};

/** Later trees win. Tokens are replaced whole, groups are merged. */
export const merge = (...trees: TokenTree[]): TokenTree => {
	const out: TokenTree = {};
	for (const tree of trees) {
		for (const [key, node] of Object.entries(tree)) {
			const existing = out[key];
			if (
				typeof node === "object" &&
				!isToken(node) &&
				typeof existing === "object" &&
				!isToken(existing)
			) {
				out[key] = merge(existing, node);
			} else {
				out[key] = node;
			}
		}
	}
	return out;
};

export const setToken = (
	tree: TokenTree,
	path: string[],
	token: Token,
): void => {
	let group = tree;
	for (const key of path.slice(0, -1)) {
		group[key] ??= {};
		group = group[key] as TokenTree;
	}
	group[path.at(-1) as string] = token;
};

// --------------------------------------------------------------- colour

export type Rgb = [number, number, number];

export const hexToRgb = (hex: string): Rgb => {
	const value = hex.replace("#", "");
	return [0, 2, 4].map(
		(index) => Number.parseInt(value.slice(index, index + 2), 16) / 255,
	) as Rgb;
};

export const rgbToHex = (rgb: Rgb): string =>
	`#${rgb
		.map((channel) =>
			Math.round(Math.min(1, Math.max(0, channel)) * 255)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;

const round = (value: number, digits = 4): number =>
	Number(value.toFixed(digits));

export const color = (hex: string, alpha = 1): ColorValue => {
	const normalised = hex.toLowerCase();
	const value: ColorValue = {
		colorSpace: "srgb",
		components: hexToRgb(normalised).map((channel) => round(channel)) as Rgb,
		hex: normalised,
	};
	if (alpha < 1) value.alpha = round(alpha);
	return value;
};

const toLinear = (channel: number): number =>
	channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const toGamma = (channel: number): number =>
	channel <= 0.0031308
		? channel * 12.92
		: 1.055 * channel ** (1 / 2.4) - 0.055;

export type Oklab = [number, number, number];

export const rgbToOklab = (rgb: Rgb): Oklab => {
	const [r, g, b] = rgb.map(toLinear) as Rgb;
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
};

const oklabToLinear = ([L, a, b]: Oklab): Rgb => {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
};

export const oklabToRgb = (lab: Oklab): Rgb =>
	oklabToLinear(lab).map(toGamma) as Rgb;

export const inGamut = (lab: Oklab): boolean =>
	oklabToLinear(lab).every((channel) => channel >= -1e-4 && channel <= 1.0001);

/** WCAG relative luminance. */
export const luminance = (rgb: Rgb): number => {
	const [r, g, b] = rgb.map(toLinear) as Rgb;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two opaque colours. */
export const contrast = (a: string, b: string): number => {
	const [light, dark] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort(
		(x, y) => y - x,
	) as [number, number];
	return (light + 0.05) / (dark + 0.05);
};
