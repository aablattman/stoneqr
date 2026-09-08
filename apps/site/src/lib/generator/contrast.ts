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
 * Measured 2026-09-07: a heart silhouette rendered at every grey from 0 to 255 as the shape
 * colour, black code on white, decoded on every one — including a shape identical to the code
 * colour. The dots are painted at full strength over the picture, so the module pattern survives
 * whatever the shape does and the decode check never objects. This is therefore an appearance
 * bar, not a scanning one: 3:1 is what WCAG 1.4.11 asks of a graphical object, which is what the
 * shape is. The code itself keeps the stricter `CONTRAST_MIN`, and the decode check stays the
 * gate. What a mid-tone shape costs on a real phone at 30 mm is row G of the scan matrix.
 */
export const SHAPE_CONTRAST_MIN = 3;

/**
 * How well a silhouette's shape stands out from the paper, as a ratio.
 *
 * Only the background pair is worth checking, which is a correction to the first version of this
 * rule. Inside the shape the dark dots are the code colour and the light dots are the background
 * colour, and the pattern survives whichever of the two the shape resembles: a shape close to the
 * code colour reads as solid ink with the light dots punched through it, which is the classic
 * silhouette and exactly what these shapes are for — it was wrong to warn about it. A shape close
 * to the paper is the real failure, because then there is nothing to see: the shape disappears
 * into the background and takes the light dots standing in it along too.
 */
export function shapeContrast(shape: string, bg: string): number {
	return contrastRatio(shape, paperColor(bg));
}
