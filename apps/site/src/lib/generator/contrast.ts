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
