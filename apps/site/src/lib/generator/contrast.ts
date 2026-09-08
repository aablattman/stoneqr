import { contrastRatio, paperColor } from '@stoneqr/engine';

/**
 * Whichever of the code colour and the corner colour reads worst against the background. The
 * sizing rules, the contrast badge, and the red-light warning all look at this one, because a
 * scanner that cannot find the finder patterns never gets as far as the data. A transparent
 * background prints on paper, which the sizing rules treat as white, so the comparison happens
 * against that; skipping it left pale corners on transparent unchecked.
 */
export function weakestForeground(fg: string, cornerColor: string | null, bg: string): string {
	if (!cornerColor) return fg;
	const paper = paperColor(bg);
	return contrastRatio(cornerColor, paper) < contrastRatio(fg, paper) ? cornerColor : fg;
}

/**
 * The bar a silhouette's shape colour is held to, and it is deliberately not `CONTRAST_MIN`.
 *
 * Measured 2026-09-07 before this threshold was chosen: a heart silhouette rendered at every
 * grey from 0 to 255 as the shape colour, black code on white, decoded on every single one,
 * including a shape identical to the code colour. The dots are painted at full strength over
 * the picture, so the module pattern survives whatever the shape does; the decode check never
 * objects. Warning at 4:1 would therefore have been telling people a scan was at risk on
 * evidence we do not have, and would have fired on almost everything: with a black code on
 * white paper, clearing 4:1 on both pairs needs the shape between about 0.15 and 0.21
 * luminance, a band so narrow that the site's own accent teal (3.5:1) misses it.
 *
 * So this is an appearance bar, not a scanning one: 3:1 is what WCAG 1.4.11 asks of a graphical
 * object, which is what the shape is. The code itself keeps the stricter `CONTRAST_MIN`, and
 * the decode check stays the gate. Whether a mid-tone shape costs anything on a real phone at
 * 30 mm is a question for row G of the scan matrix, not for a rule invented here.
 */
export const SHAPE_CONTRAST_MIN = 3;

/** Which pair a shape colour fails on; they need opposite advice, so the caller is told which. */
export type ShapeRisk = {
	/** The worse of the two ratios. */
	ratio: number;
	/** `background` when the shape barely shows, `code` when it swallows its own dots. */
	worst: 'background' | 'code';
};

/**
 * What a silhouette's shape colour costs, as a ratio and the pair that costs it.
 *
 * A silhouette paints the shape between the dots; the dots themselves stay the code and
 * background colours, so two pairs matter that `weakestForeground` cannot express. The shape
 * against the paper decides whether the shape shows at all: one that reads as paper vanishes,
 * and the light dots standing on it go with it. The code colour against the shape is the pair
 * that actually breaks a scan, because a shape close to the code colour swallows its own dark
 * dots and reads as one solid blob.
 *
 * A ratio rather than a colour, because "code against shape" is not a foreground against paper
 * and so cannot be folded into `weakestForeground` and handed to the engine's sizing rules.
 * §8j asked for this "the way they take the corner colour"; a corner colour is one more ink on
 * the same paper, and a shape colour is the paper for half the dots. For the same reason it does
 * not reach the Style panel's contrast badge, which is the code's own print-safety and would be
 * downgraded by a shape that costs a scan nothing (see `SHAPE_CONTRAST_MIN`).
 */
export function shapeContrast(fg: string, shape: string, bg: string): ShapeRisk {
	const paper = paperColor(bg);
	const onPaper = contrastRatio(shape, paper);
	const onCode = contrastRatio(fg, shape);
	return onPaper < onCode ? { ratio: onPaper, worst: 'background' } : { ratio: onCode, worst: 'code' };
}
