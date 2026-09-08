/**
 * What the print test sheet lays out. The four-step ladder is the point of the sheet, but the
 * width the design is set to belongs on it too, so the size someone is about to order is one of
 * the codes they scan. Pure, so the rules are testable.
 */
import type { LengthUnit } from '@stoneqr/engine';

/** The sizes every sheet carries, in mm. */
export const TEST_SHEET_LADDER = [15, 20, 30, 50] as const;
/** Larger than this and the code would not share a page with the ladder; the plain PDF is for that. */
export const TEST_SHEET_MAX_MM = 100;

/** The ladder plus the chosen width, rounded to a tenth, when it is not already there and fits the page. */
export function testSheetSizes(widthMm: number): number[] {
	const sizes: number[] = [...TEST_SHEET_LADDER];
	const chosen = Math.round(widthMm * 10) / 10;
	if (Number.isFinite(chosen) && chosen > 0 && chosen <= TEST_SHEET_MAX_MM && !sizes.includes(chosen)) sizes.push(chosen);
	return sizes.sort((a, b) => a - b);
}

/** Regions that print on US Letter; everywhere else is A4. */
const LETTER_REGIONS = new Set(['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'DO', 'GT', 'CR', 'PA']);

/**
 * The paper the sheet is laid out on. Inches say Letter outright; otherwise the browser's
 * locale region decides, with A4 for anywhere not on the Letter list and when there is no region.
 */
export function testSheetPage(unit: LengthUnit, locale: string | undefined): 'A4' | 'Letter' {
	if (unit === 'in') return 'Letter';
	const region = /[-_]([A-Za-z]{2})\b/.exec(locale ?? '')?.[1]?.toUpperCase();
	return region && LETTER_REGIONS.has(region) ? 'Letter' : 'A4';
}
