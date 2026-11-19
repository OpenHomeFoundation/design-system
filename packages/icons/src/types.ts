/**
 * One icon: the list of shapes inside its 24×24 SVG, in drawing order.
 * This is the same shape Lucide uses, so data from either works everywhere.
 *
 * @example [["path", { d: "M5 12h14" }], ["circle", { cx: "12", cy: "12", r: "10" }]]
 */
export type IconNode = readonly (readonly [
	tag: string,
	attributes: Readonly<Record<string, string>>,
])[];
