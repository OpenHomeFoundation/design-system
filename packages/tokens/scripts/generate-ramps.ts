/**
 * Writes `src/primitive/color.ramps.tokens.json`: every colour the designer's
 * export does not contain.
 *
 * 1. Missing steps of the designer's ramps, so each has the full 50–950 set.
 *    - green, red, amber, violet and teal are Tailwind v3's palette, so the
 *      missing steps come from Tailwind exactly.
 *    - blue, grey and warm-grey are custom, so missing steps are interpolated
 *      in OKLab between the designer's neighbouring steps.
 * 2. The Open Home Foundation brand colours as ramps:
 *    - light-blue is Home Assistant's primary ramp (500 is OHF Light Blue).
 *    - dark-blue and blue-grey are built around the brand colours, which sit
 *      at their exact value on the nearest step.
 *
 * Every token written here carries a `$extensions` note saying where its value
 * came from. The designer's own values are never changed.
 */
import { join } from "node:path";

import {
	color,
	GENERATED,
	hexToRgb,
	inGamut,
	isToken,
	oklabToRgb,
	RAMP_STEPS,
	readJson,
	rgbToHex,
	rgbToOklab,
	root,
	writeJson,
} from "./lib.ts";
import type { ColorValue, Oklab, Token, TokenTree } from "./lib.ts";

type Ramp = Record<string, string>;
type Step = (typeof RAMP_STEPS)[number];

const TAILWIND_HUES = ["green", "red", "amber", "violet", "teal"] as const;
const INTERPOLATED_HUES = ["blue", "grey", "warm-grey"] as const;

/** The OHF brand palette, from the brands site. */
const OHF = {
	"light-blue": "#18bcf2",
	"dark-blue": "#09293b",
	"dark-grey": "#5a6675",
	grey: "#a2aab6",
	"light-grey": "#f7f6f2",
} as const;

const generated = (hex: string, source: string): Token => ({
	$type: "color",
	$value: color(hex),
	$extensions: { [GENERATED]: source },
});

const designer = readJson(
	join(root, "src/primitive/color.figma.tokens.json"),
).color as TokenTree;

const designerRamp = (hue: string): Ramp => {
	const ramp: Ramp = {};
	for (const [step, token] of Object.entries(designer[hue] as TokenTree)) {
		if (isToken(token)) ramp[step] = (token.$value as ColorValue).hex;
	}
	return ramp;
};

const out: TokenTree = {};

// ------------------------------------------------- 1a. Tailwind fills

const tailwind = readJson<Record<string, Ramp>>(
	join(root, "scripts/data/tailwind-v3.json"),
);

for (const hue of TAILWIND_HUES) {
	const existing = designerRamp(hue);
	const reference = tailwind[hue] as Ramp;
	for (const [step, hex] of Object.entries(existing)) {
		if (reference[step] !== hex) {
			throw new Error(
				`${hue}.${step} is ${hex} in the Figma export but ${reference[step]} in Tailwind v3. ` +
					`The designer changed this ramp: move "${hue}" to INTERPOLATED_HUES.`,
			);
		}
	}
	const fills: TokenTree = {};
	for (const step of RAMP_STEPS) {
		if (!(step in existing)) {
			fills[step] = generated(reference[step] as string, "tailwind-v3");
		}
	}
	out[hue] = fills;
}

// --------------------------------------------- 1b. Interpolated fills

const mix = (a: Oklab, b: Oklab, t: number): Oklab =>
	a.map((value, index) => value + ((b[index] as number) - value) * t) as Oklab;

for (const hue of INTERPOLATED_HUES) {
	const existing = designerRamp(hue);
	const known = RAMP_STEPS.filter((step) => step in existing);
	const fills: TokenTree = {};
	for (const step of RAMP_STEPS) {
		if (step in existing) continue;
		const index = RAMP_STEPS.indexOf(step);
		const below = known.findLast((candidate) => candidate < step);
		const above = known.find((candidate) => candidate > step);
		if (below === undefined || above === undefined) {
			throw new Error(`${hue}.${step} has no neighbour to interpolate from`);
		}
		const from = RAMP_STEPS.indexOf(below);
		const to = RAMP_STEPS.indexOf(above);
		const lab = mix(
			rgbToOklab(hexToRgb(existing[below] as string)),
			rgbToOklab(hexToRgb(existing[above] as string)),
			(index - from) / (to - from),
		);
		fills[step] = generated(
			rgbToHex(oklabToRgb(lab)),
			`interpolated between ${hue}.${below} and ${hue}.${above}`,
		);
	}
	out[hue] = fills;
}

// ----------------------------------------------------- 2. OHF colours

// Home Assistant numbers 05 (darkest) to 95 (lightest); we number 50
// (lightest) to 950 (darkest). Both have eleven steps, so they map one to one.
const ha = readJson<{ primary: Ramp }>(
	join(root, "scripts/data/home-assistant.json"),
).primary;
const haSteps = Object.keys(ha).sort().reverse();
out["light-blue"] = Object.fromEntries(
	RAMP_STEPS.map((step, index) => {
		const haStep = haSteps[index] as string;
		return [
			step,
			generated(ha[haStep] as string, `home-assistant primary-${haStep}`),
		];
	}),
);

/** Target OKLab lightness and relative chroma of each step. */
const SHAPE: Record<Step, { lightness: number; chroma: number }> = {
	50: { lightness: 0.975, chroma: 0.25 },
	100: { lightness: 0.945, chroma: 0.4 },
	200: { lightness: 0.89, chroma: 0.6 },
	300: { lightness: 0.82, chroma: 0.8 },
	400: { lightness: 0.72, chroma: 0.95 },
	500: { lightness: 0.62, chroma: 1 },
	600: { lightness: 0.52, chroma: 1 },
	700: { lightness: 0.43, chroma: 0.95 },
	800: { lightness: 0.35, chroma: 0.85 },
	900: { lightness: 0.27, chroma: 0.7 },
	950: { lightness: 0.2, chroma: 0.55 },
};

const nearestStep = (lightness: number): Step =>
	RAMP_STEPS.reduce((best, step) =>
		Math.abs(SHAPE[step].lightness - lightness) <
		Math.abs(SHAPE[best].lightness - lightness)
			? step
			: best,
	);

/**
 * Builds a ramp with the hue of the anchor colours. Each anchor keeps its
 * exact value on the step whose lightness is closest to it.
 */
const rampAround = (
	name: string,
	anchors: Record<string, string>,
): { ramp: TokenTree; steps: Record<string, Step> } => {
	const placed = Object.entries(anchors).map(([anchor, hex]) => {
		const [lightness, a, b] = rgbToOklab(hexToRgb(hex));
		const step = nearestStep(lightness);
		return {
			anchor,
			hex,
			step,
			hue: Math.atan2(b, a),
			peak: Math.hypot(a, b) / SHAPE[step].chroma,
		};
	});
	const average = (pick: (item: (typeof placed)[number]) => number): number =>
		placed.reduce((sum, item) => sum + pick(item), 0) / placed.length;
	const hue = average((item) => item.hue);
	const peak = average((item) => item.peak);

	const ramp: TokenTree = {};
	for (const step of RAMP_STEPS) {
		const anchor = placed.find((item) => item.step === step);
		if (anchor) {
			ramp[step] = generated(anchor.hex, `ohf brand colour ${anchor.anchor}`);
			continue;
		}
		const { lightness, chroma } = SHAPE[step];
		let c = peak * chroma;
		let lab: Oklab = [lightness, c * Math.cos(hue), c * Math.sin(hue)];
		while (!inGamut(lab) && c > 0) {
			c -= 0.002;
			lab = [lightness, c * Math.cos(hue), c * Math.sin(hue)];
		}
		ramp[step] = generated(
			rgbToHex(oklabToRgb(lab)),
			`ramp built around ${Object.keys(anchors).join(" and ")}`,
		);
	}
	const steps = Object.fromEntries(
		placed.map((item) => [item.anchor, item.step]),
	);
	if (new Set(Object.values(steps)).size !== placed.length) {
		throw new Error(`Two anchors of ${name} landed on the same step`);
	}
	return { ramp, steps };
};

const darkBlue = rampAround("dark-blue", { "dark-blue": OHF["dark-blue"] });
const blueGrey = rampAround("blue-grey", {
	grey: OHF.grey,
	"dark-grey": OHF["dark-grey"],
});
out["dark-blue"] = darkBlue.ramp;
out["blue-grey"] = blueGrey.ramp;

const reference = (path: string, description: string): Token => ({
	$type: "color",
	$value: `{${path}}`,
	$description: description,
});

// The brand palette by name, for places that need the exact brand colour.
out.ohf = {
	"light-blue": reference("color.light-blue.500", "OHF Light Blue."),
	"dark-blue": reference(
		`color.dark-blue.${darkBlue.steps["dark-blue"]}`,
		"OHF Dark Blue.",
	),
	"dark-grey": reference(
		`color.blue-grey.${blueGrey.steps["dark-grey"]}`,
		"OHF Dark Grey.",
	),
	grey: reference(`color.blue-grey.${blueGrey.steps.grey}`, "OHF Grey."),
	"light-grey": {
		$type: "color",
		$value: color(OHF["light-grey"]),
		$description: "OHF Light Grey.",
	},
};

writeJson(join(root, "src/primitive/color.ramps.tokens.json"), { color: out });

const count = (tree: TokenTree): number =>
	Object.values(tree).reduce<number>(
		(sum, node) =>
			typeof node === "string"
				? sum
				: sum + (isToken(node) ? 1 : count(node)),
		0,
	);
console.log(`Wrote ${count(out)} colours to src/primitive/color.ramps.tokens.json`);
