import { describe, expect, it } from 'vitest';
import { TEST_SHEET_LADDER, TEST_SHEET_MAX_MM, testSheetPage, testSheetSizes } from '$lib/generator/test-sheet';

describe('test sheet', () => {
	it('adds the chosen width to the ladder, in order, once', () => {
		expect(testSheetSizes(50)).toEqual([...TEST_SHEET_LADDER]);
		expect(testSheetSizes(25)).toEqual([15, 20, 25, 30, 50]);
		expect(testSheetSizes(80)).toEqual([15, 20, 30, 50, 80]);
		expect(testSheetSizes(25.04)).toEqual([15, 20, 25, 30, 50]);
		expect(testSheetSizes(76.2)).toEqual([15, 20, 30, 50, 76.2]);
	});

	it('leaves out a width that would not share the page', () => {
		expect(testSheetSizes(TEST_SHEET_MAX_MM + 1)).toEqual([...TEST_SHEET_LADDER]);
		expect(testSheetSizes(300)).toEqual([...TEST_SHEET_LADDER]);
		expect(testSheetSizes(0)).toEqual([...TEST_SHEET_LADDER]);
		expect(testSheetSizes(NaN)).toEqual([...TEST_SHEET_LADDER]);
	});

	it('picks the paper from the unit, then the locale', () => {
		expect(testSheetPage('in', 'de-DE')).toBe('Letter');
		expect(testSheetPage('mm', 'en-US')).toBe('Letter');
		expect(testSheetPage('mm', 'en_CA')).toBe('Letter');
		expect(testSheetPage('mm', 'en-GB')).toBe('A4');
		expect(testSheetPage('cm', 'de')).toBe('A4');
		expect(testSheetPage('mm', undefined)).toBe('A4');
	});
});
