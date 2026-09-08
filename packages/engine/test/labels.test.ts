import { describe, expect, it } from 'vitest';
import { PDFDocument, cmyk, rgb } from 'pdf-lib';
import { encode } from '../src/encode.js';
import {
	calibrationSheet,
	labelColours,
	labelsPerSheet,
	layoutLabels,
	sheets,
	sheetsNeeded,
	type LabelItem
} from '../src/labels.js';

/** Avery's stated label sizes, in mm, converted from the inch sizes on the box. */
const statedSizeMm: Record<string, [number, number]> = {
	'5160': [2.625 * 25.4, 1 * 25.4],
	'5163': [4 * 25.4, 2 * 25.4],
	'5395': [3.375 * 25.4, (2 + 1 / 3) * 25.4],
	L7160: [63.5, 38.1]
};

const items = (n: number, label?: (i: number) => string): LabelItem[] =>
	Array.from({ length: n }, (_, i) => ({
		qr: encode(`https://stoneqr.app/x/${i}`),
		payload: `https://stoneqr.app/x/${i}`,
		...(label ? { label: label(i) } : {})
	}));

describe('sheet geometry', () => {
	for (const [id, sheet] of Object.entries(sheets)) {
		describe(id, () => {
			it('has the id it is filed under', () => {
				expect(sheet.id).toBe(id);
			});

			it('fits the page with symmetric margins', () => {
				const usedX = sheet.marginLeftMm + (sheet.columns - 1) * sheet.pitchXMm + sheet.labelWidthMm;
				const usedY = sheet.marginTopMm + (sheet.rows - 1) * sheet.pitchYMm + sheet.labelHeightMm;
				expect(usedX).toBeLessThanOrEqual(sheet.pageWidthMm + 1e-9);
				expect(usedY).toBeLessThanOrEqual(sheet.pageHeightMm + 1e-9);
				const marginRight = sheet.pageWidthMm - usedX;
				const marginBottom = sheet.pageHeightMm - usedY;
				expect(Math.abs(marginRight - sheet.marginLeftMm)).toBeLessThanOrEqual(1);
				expect(Math.abs(marginBottom - sheet.marginTopMm)).toBeLessThanOrEqual(1);
			});

			it('never overlaps labels', () => {
				expect(sheet.pitchXMm).toBeGreaterThanOrEqual(sheet.labelWidthMm);
				expect(sheet.pitchYMm).toBeGreaterThanOrEqual(sheet.labelHeightMm);
			});

			it("matches Avery's stated label size within 0.2 mm", () => {
				const [w, h] = statedSizeMm[id]!;
				expect(Math.abs(sheet.labelWidthMm - w)).toBeLessThanOrEqual(0.2);
				expect(Math.abs(sheet.labelHeightMm - h)).toBeLessThanOrEqual(0.2);
			});

			it('uses the right page size and cites a source', () => {
				const [pw, ph] = sheet.page === 'Letter' ? [215.9, 279.4] : [210, 297];
				expect(sheet.pageWidthMm).toBeCloseTo(pw, 3);
				expect(sheet.pageHeightMm).toBeCloseTo(ph, 3);
				expect(sheet.note ?? '').toMatch(/https?:\/\//);
			});
		});
	}
});

describe('counting helpers', () => {
	it('counts labels per sheet', () => {
		expect(labelsPerSheet('5160')).toBe(30);
		expect(labelsPerSheet('5163')).toBe(10);
		expect(labelsPerSheet('5395')).toBe(8);
		expect(labelsPerSheet('L7160')).toBe(21);
	});
	it('counts sheets, including from a part-used sheet', () => {
		expect(sheetsNeeded(0, '5160')).toBe(0);
		expect(sheetsNeeded(1, '5160')).toBe(1);
		expect(sheetsNeeded(30, '5160')).toBe(1);
		expect(sheetsNeeded(35, '5160')).toBe(2);
		expect(sheetsNeeded(35, '5160', 25)).toBe(2);
		expect(sheetsNeeded(6, '5160', 25)).toBe(2);
	});
	it('prints the chosen colours, keeping black as 100% K and captions black', () => {
		expect(labelColours({})).toEqual({ ink: cmyk(0, 0, 0, 1), fill: undefined, caption: cmyk(0, 0, 0, 1) });
		expect(labelColours({ cmyk: false })).toEqual({ ink: rgb(0, 0, 0), fill: undefined, caption: rgb(0, 0, 0) });
		const red = labelColours({ fg: '#ff0000', bg: '#ffffff' });
		expect(red.ink).toEqual(rgb(1, 0, 0));
		expect(red.fill).toBeUndefined();
		expect(red.caption).toEqual(cmyk(0, 0, 0, 1));
		expect(labelColours({ bg: 'transparent' }).fill).toBeUndefined();
		expect(labelColours({ bg: '#ffffcc' }).fill).toEqual(rgb(1, 1, 0.8));
	});

	it('lays out in colour with a fill behind each code', async () => {
		const pdf = await layoutLabels(items(3), '5160', { fg: '#003366', bg: '#eeeeee', codeSizeMm: 15 });
		const doc = await PDFDocument.load(pdf);
		expect(doc.getPageCount()).toBe(1);
	});

	it('rejects an unknown sheet', () => {
		expect(() => labelsPerSheet('nope')).toThrow(/Unknown label sheet/);
	});
});

describe('layoutLabels', () => {
	it('lays 35 codes onto two Letter sheets', async () => {
		const bytes = await layoutLabels(items(35, (i) => `Table ${i + 1}`), '5160');
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBe(2);
		expect(doc.getTitle()).toBe('StoneQR labels');
		const { width, height } = doc.getPage(0).getSize();
		expect(width).toBeCloseTo(612, 2);
		expect(height).toBeCloseTo(792, 2);
	});

	it('still needs two sheets when starting part-way down the first', async () => {
		const bytes = await layoutLabels(items(35), '5160', { startAt: 25 });
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBe(2);
	});

	it('always emits at least one page', async () => {
		const doc = await PDFDocument.load(await layoutLabels([], '5160'));
		expect(doc.getPageCount()).toBe(1);
	});

	it('sizes A4 pages in points', async () => {
		const doc = await PDFDocument.load(await layoutLabels(items(3), 'L7160'));
		const { width, height } = doc.getPage(0).getSize();
		expect(width).toBeCloseTo(595.276, 2);
		expect(height).toBeCloseTo(841.89, 2);
	});

	it('handles long, non-WinAnsi captions and every option', async () => {
		const long = 'Warehouse bay 7 — pallet ' + 'x'.repeat(200) + ' 🎉 東京';
		const bytes = await layoutLabels(items(9, () => long), '5395', {
			caption: 'label',
			fontSizePt: 9,
			quietZone: 2,
			codeSizeMm: 30,
			cmyk: false,
			outlines: true
		});
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBe(2);
	});

	it('drops the caption when asked', async () => {
		const withCaption = await layoutLabels(items(4, (i) => `Room ${i}`), '5163');
		const without = await layoutLabels(items(4, (i) => `Room ${i}`), '5163', { caption: 'none' });
		expect(without.byteLength).toBeLessThan(withCaption.byteLength);
	});
});

describe('calibrationSheet', () => {
	it('is one page of outlines with instructions', async () => {
		for (const id of Object.keys(sheets)) {
			const doc = await PDFDocument.load(await calibrationSheet(id));
			expect(doc.getPageCount()).toBe(1);
			const sheet = sheets[id]!;
			const { width } = doc.getPage(0).getSize();
			expect(width).toBeCloseTo((sheet.pageWidthMm * 72) / 25.4, 2);
		}
	});
});
