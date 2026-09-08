import { PDFDocument, StandardFonts, cmyk, rgb, type Color, type PDFFont, type PDFPage } from 'pdf-lib';
import { matrixToPath } from './render/svg.js';
import { isTransparent, parseRgb } from './export/png.js';
import type { EncodedQr } from './types.js';

/** Points per millimetre. PDF user space is 1/72 inch. */
const PT_PER_MM = 72 / 25.4;

/** Millimetres to PDF points. */
export function mmToPt(mm: number): number {
	return mm * PT_PER_MM;
}

/** Padding inside each label, in mm. Keeps ink off the die-cut edge. */
const PAD_MM = 2;

/**
 * The geometry of one label sheet, in millimetres, measured from the top-left of the page.
 * `pitch` is centre-to-centre (label size plus the gutter), not the gutter itself.
 */
export interface SheetGeometry {
	id: string;
	name: string;
	page: 'Letter' | 'A4';
	pageWidthMm: number;
	pageHeightMm: number;
	labelWidthMm: number;
	labelHeightMm: number;
	columns: number;
	rows: number;
	marginTopMm: number;
	marginLeftMm: number;
	pitchXMm: number;
	pitchYMm: number;
	/** Die-cut corner radius, informational; the layout does not round anything. */
	cornerRadiusMm?: number;
	/** Where the numbers came from, and which of them are still unverified. */
	note?: string;
}

const LO =
	'https://raw.githubusercontent.com/LibreOffice/core/master/extras/source/labels/labels.xml';
const GL = 'https://raw.githubusercontent.com/jimevins/glabels/master/templates/avery-us-templates.xml';

/**
 * Avery geometry. Every value below is transcribed from a published template table, not measured
 * by hand; see each sheet's `note`. Print `calibrationSheet(id)` before committing to 300 labels.
 */
export const sheets: Record<string, SheetGeometry> = {
	'5160': {
		id: '5160',
		name: 'Avery 5160 address labels (2-5/8" x 1")',
		page: 'Letter',
		pageWidthMm: 215.9,
		pageHeightMm: 279.4,
		labelWidthMm: 66.68,
		labelHeightMm: 25.4,
		columns: 3,
		rows: 10,
		marginTopMm: 12.7,
		marginLeftMm: 4.78,
		pitchXMm: 69.85,
		pitchYMm: 25.4,
		cornerRadiusMm: 1.59,
		note:
			`Verified: label 66.68 x 25.4 mm (2-5/8" x 1"), 3 x 10, margins 4.78/12.7 mm, pitch 69.85/25.4 mm — LibreOffice label database "5160 Address" (${LO}), which agrees with the Microsoft Word Avery 5160 definition and with avery.com/templates/5160 for size and count. Conflict: gLabels (${GL}) gives x0 0.15625" / dx 2.78125" (3.97 / 70.64 mm); both are symmetric, and the LibreOffice/Word figures were preferred. Corner radius 1.59 mm (0.0625") from gLabels [unverified against Avery].`
	},
	'5163': {
		id: '5163',
		name: 'Avery 5163 shipping labels (4" x 2")',
		page: 'Letter',
		pageWidthMm: 215.9,
		pageHeightMm: 279.4,
		labelWidthMm: 101.6,
		labelHeightMm: 50.8,
		columns: 2,
		rows: 5,
		marginTopMm: 12.7,
		marginLeftMm: 3.96,
		pitchXMm: 106.36,
		pitchYMm: 50.8,
		cornerRadiusMm: 3.18,
		note:
			`Verified: label 101.6 x 50.8 mm (4" x 2"), 2 x 5, margins 3.96/12.7 mm, pitch 106.36/50.8 mm — LibreOffice label database "5163 Address / Shipping" (${LO}); gLabels (${GL}) independently gives dx 4.1875" (106.36 mm), dy 2", y0 0.5" and x0 0.1625" (4.13 mm, 0.17 mm from the value used). Corner radius 3.18 mm (0.125") from gLabels [unverified against Avery].`
	},
	'5395': {
		id: '5395',
		name: 'Avery 5395 name badges (3-3/8" x 2-1/3")',
		page: 'Letter',
		pageWidthMm: 215.9,
		pageHeightMm: 279.4,
		labelWidthMm: 85.73,
		labelHeightMm: 59.26,
		columns: 2,
		rows: 4,
		marginTopMm: 14.82,
		marginLeftMm: 17.48,
		pitchXMm: 95.25,
		pitchYMm: 63.5,
		cornerRadiusMm: 4.76,
		note:
			`Verified twice: label 85.73 x 59.26 mm (3-3/8" x 2-1/3"), 2 x 4, margins 17.48/14.82 mm, pitch 95.25/63.5 mm — LibreOffice label database "5395 Name Badge" (${LO}) and gLabels (${GL}: x0 0.6875", y0 0.583333", dx 3.75", dy 2.5"), which agree to 0.02 mm. Corner radius 4.76 mm (0.1875") from gLabels [unverified against Avery].`
	},
	L7160: {
		id: 'L7160',
		name: 'Avery L7160 address labels (63.5 x 38.1 mm, A4)',
		page: 'A4',
		pageWidthMm: 210,
		pageHeightMm: 297,
		labelWidthMm: 63.5,
		labelHeightMm: 38.1,
		columns: 3,
		rows: 7,
		marginTopMm: 15.15,
		marginLeftMm: 7.2,
		pitchXMm: 66.0,
		pitchYMm: 38.1,
		cornerRadiusMm: 1.8,
		note:
			`Verified: label 63.5 x 38.1 mm, 3 x 7 (21 per sheet, matching avery.co.uk/template-l7160), margins 7.2/15.15 mm, pitch 66.0/38.1 mm — LibreOffice label database "L7160 Address" (${LO}). gLabels states the equivalent Avery 7160 in points (${GL.replace('avery-us', 'avery-iso')}: 181.4 x 108 pt, x0 21.2, y0 43.9, dx 187.2), i.e. 63.99 x 38.1 mm with a 7.48 mm left margin — 0.5 mm wider labels, so the metric LibreOffice figures were preferred. Corner radius 1.8 mm [unverified].`
	}
};

function requireSheet(sheetId: string): SheetGeometry {
	const sheet = sheets[sheetId];
	if (!sheet)
		throw new Error(`Unknown label sheet "${sheetId}". Known sheets: ${Object.keys(sheets).join(', ')}.`);
	return sheet;
}

/** Labels on one sheet of this kind. */
export function labelsPerSheet(sheetId: string): number {
	const sheet = requireSheet(sheetId);
	return sheet.columns * sheet.rows;
}

/**
 * Sheets needed for `count` labels, when the first `startAt` positions of the first sheet are
 * already used up (a part-used sheet fed back through the printer).
 */
export function sheetsNeeded(count: number, sheetId: string, startAt = 0): number {
	const per = labelsPerSheet(sheetId);
	const n = Math.max(0, Math.floor(count));
	if (n === 0) return 0;
	return Math.ceil((Math.max(0, Math.floor(startAt)) + n) / per);
}

/** One code, with the caption to print beside it. */
export interface LabelItem {
	qr: Pick<EncodedQr, 'matrix' | 'size'>;
	label?: string;
	payload?: string;
}

export interface LayoutOptions {
	/** Quiet zone in modules, included inside the code's printed size. Default 4. */
	quietZone?: number;
	/** Printed size of the code square in mm. Default: the label height minus 4 mm of padding, capped by the width. */
	codeSizeMm?: number;
	/** Print the item's label (falling back to its payload) beside the code, or nothing. Default 'label'. */
	caption?: 'label' | 'none';
	/** Caption size in points. Default 8. */
	fontSizePt?: number;
	/** Print black as CMYK 100% K rather than RGB black. Default true. */
	cmyk?: boolean;
	/** The code's dark colour, hex. Default black. Captions stay black, since a pale ink would make them unreadable before it made the code so. */
	fg?: string;
	/** A fill behind the code square, hex. White or 'transparent' (the default) draws nothing, since label stock is white. */
	bg?: string;
	/** 0-based label position to start at, so a part-used sheet can be reused. Default 0. */
	startAt?: number;
	/** Draw faint 0.2 pt label outlines, for a calibration print. Default false. */
	outlines?: boolean;
}

/**
 * Lay codes out on label sheets and return a multi-page PDF, one page per sheet.
 * Labels fill left to right, top to bottom. The code is left-aligned inside its label with 2 mm of
 * padding and the caption sits to its right, truncated with an ellipsis to fit.
 */
export async function layoutLabels(
	items: LabelItem[],
	sheetId: string,
	opts: LayoutOptions = {}
): Promise<Uint8Array> {
	const sheet = requireSheet(sheetId);
	const per = sheet.columns * sheet.rows;
	const startAt = Math.max(0, Math.floor(opts.startAt ?? 0));
	const quiet = Math.max(0, opts.quietZone ?? 4);
	const wantsCaption = (opts.caption ?? 'label') !== 'none';
	const fontSize = opts.fontSizePt ?? 8;
	const { ink, fill, caption: captionInk } = labelColours(opts);

	const doc = await PDFDocument.create();
	doc.setTitle('StoneQR labels');
	doc.setCreator('StoneQR (stoneqr.app)');
	doc.setProducer('StoneQR');
	const font = await doc.embedFont(StandardFonts.Helvetica);

	const pageCount = Math.max(1, sheetsNeeded(items.length, sheetId, startAt));
	const pages: PDFPage[] = [];
	for (let p = 0; p < pageCount; p++) {
		const page = addSheetPage(doc, sheet);
		if (opts.outlines) drawOutlines(page, sheet);
		pages.push(page);
	}

	const pageHeightPt = mmToPt(sheet.pageHeightMm);
	const availWMm = sheet.labelWidthMm - 2 * PAD_MM;
	const availHMm = sheet.labelHeightMm - 2 * PAD_MM;

	for (let i = 0; i < items.length; i++) {
		const item = items[i]!;
		const pos = startAt + i;
		const page = pages[Math.floor(pos / per)]!;
		const cell = pos % per;
		const col = cell % sheet.columns;
		const row = Math.floor(cell / sheet.columns);
		const leftMm = sheet.marginLeftMm + col * sheet.pitchXMm;
		const topMm = sheet.marginTopMm + row * sheet.pitchYMm;

		const caption = wantsCaption ? sanitizeText(item.label ?? item.payload ?? '') : '';
		const hasCaption = caption.length > 0;
		const defaultCodeMm = hasCaption
			? Math.min(availHMm, availWMm * 0.5)
			: Math.min(availHMm, availWMm);
		const codeMm = Math.max(0, Math.min(opts.codeSizeMm ?? defaultCodeMm, availHMm, availWMm));
		if (codeMm <= 0) continue;

		const codeLeftMm = leftMm + PAD_MM;
		const codeTopMm = topMm + (sheet.labelHeightMm - codeMm) / 2;
		const modules = item.qr.size + 2 * quiet;
		if (fill) {
			page.drawRectangle({
				x: mmToPt(codeLeftMm),
				y: pageHeightPt - mmToPt(codeTopMm + codeMm),
				width: mmToPt(codeMm),
				height: mmToPt(codeMm),
				color: fill
			});
		}
		page.drawSvgPath(matrixToPath(item.qr.matrix, quiet), {
			x: mmToPt(codeLeftMm),
			y: pageHeightPt - mmToPt(codeTopMm),
			scale: mmToPt(codeMm) / modules,
			color: ink
		});

		if (!hasCaption) continue;
		const capLeftMm = codeLeftMm + codeMm + PAD_MM;
		const capWidthPt = mmToPt(leftMm + sheet.labelWidthMm - PAD_MM - capLeftMm);
		const text = fitText(caption, font, fontSize, capWidthPt);
		if (!text) continue;
		page.drawText(text, {
			x: mmToPt(capLeftMm),
			y: pageHeightPt - mmToPt(topMm + sheet.labelHeightMm / 2) - fontSize * 0.35,
			size: fontSize,
			font,
			color: captionInk
		});
	}

	return doc.save();
}

/**
 * The colours a label run prints in. Black stays 100% K when `cmyk` is on, as the plain PDF does;
 * any other ink is RGB. White or transparent backgrounds draw no fill.
 */
export function labelColours(opts: Pick<LayoutOptions, 'cmyk' | 'fg' | 'bg'>): { ink: Color; fill: Color | undefined; caption: Color } {
	const useCmyk = opts.cmyk ?? true;
	const black: Color = useCmyk ? cmyk(0, 0, 0, 1) : rgb(0, 0, 0);
	const [r, g, b] = parseRgb(opts.fg, [0, 0, 0]);
	const ink = useCmyk && r <= 32 && g <= 32 && b <= 32 ? black : rgb(r / 255, g / 255, b / 255);
	let fill: Color | undefined;
	if (opts.bg && !isTransparent(opts.bg)) {
		const [br, bgc, bb] = parseRgb(opts.bg, [255, 255, 255]);
		if (!(br === 255 && bgc === 255 && bb === 255)) fill = rgb(br / 255, bgc / 255, bb / 255);
	}
	return { ink, fill, caption: black };
}

/**
 * A single page of label outlines and nothing else, so the geometry can be checked against a real
 * sheet held up to the light before a run of 300 labels goes through the printer.
 */
export async function calibrationSheet(sheetId: string): Promise<Uint8Array> {
	const sheet = requireSheet(sheetId);
	const doc = await PDFDocument.create();
	doc.setTitle('StoneQR labels — calibration');
	doc.setCreator('StoneQR (stoneqr.app)');
	doc.setProducer('StoneQR');
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const page = addSheetPage(doc, sheet);
	drawOutlines(page, sheet);

	const pageHeightPt = mmToPt(sheet.pageHeightMm);
	const lines = [
		`${sheet.name} — ${sheet.id}`,
		'Print at 100% scale. Hold against a real sheet to check alignment.'
	];
	// Sit the caption in whichever margin has room: the top one, or the bottom one.
	const bottomMarginMm =
		sheet.pageHeightMm - (sheet.marginTopMm + (sheet.rows - 1) * sheet.pitchYMm + sheet.labelHeightMm);
	const topAnchorMm = sheet.marginTopMm >= 10 ? 4.5 : sheet.pageHeightMm - bottomMarginMm + 4.5;
	for (let i = 0; i < lines.length; i++) {
		page.drawText(lines[i]!, {
			x: mmToPt(sheet.marginLeftMm),
			y: pageHeightPt - mmToPt(topAnchorMm + i * 3.7),
			size: 8,
			font,
			color: rgb(0.35, 0.35, 0.35)
		});
	}
	return doc.save();
}

function addSheetPage(doc: PDFDocument, sheet: SheetGeometry): PDFPage {
	return doc.addPage([mmToPt(sheet.pageWidthMm), mmToPt(sheet.pageHeightMm)]);
}

/** Faint hairlines around every label position. Calibration only; never on a production run. */
function drawOutlines(page: PDFPage, sheet: SheetGeometry): void {
	const pageHeightPt = mmToPt(sheet.pageHeightMm);
	for (let row = 0; row < sheet.rows; row++) {
		for (let col = 0; col < sheet.columns; col++) {
			const leftMm = sheet.marginLeftMm + col * sheet.pitchXMm;
			const topMm = sheet.marginTopMm + row * sheet.pitchYMm;
			page.drawRectangle({
				x: mmToPt(leftMm),
				y: pageHeightPt - mmToPt(topMm + sheet.labelHeightMm),
				width: mmToPt(sheet.labelWidthMm),
				height: mmToPt(sheet.labelHeightMm),
				borderWidth: 0.2,
				borderColor: rgb(0.6, 0.6, 0.6)
			});
		}
	}
}

/**
 * Everything WinAnsi (the encoding of the standard PDF fonts) can represent: Latin-1 plus the
 * cp1252 punctuation block, so smart quotes and dashes pasted out of a spreadsheet survive.
 */
const WIN_ANSI =
	/[^\x20-\x7e\u00a0-\u00ff\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/g;

/** Collapse whitespace and drop anything the standard WinAnsi fonts cannot encode. */
function sanitizeText(s: string): string {
	return s.replace(/\s+/g, ' ').replace(WIN_ANSI, '?').trim();
}

/** Trim to fit `maxWidthPt`, adding an ellipsis. Returns '' when not even the ellipsis fits. */
function fitText(text: string, font: PDFFont, size: number, maxWidthPt: number): string {
	if (maxWidthPt <= 0) return '';
	if (font.widthOfTextAtSize(text, size) <= maxWidthPt) return text;
	const ellipsis = '…';
	if (font.widthOfTextAtSize(ellipsis, size) > maxWidthPt) return '';
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (font.widthOfTextAtSize(text.slice(0, mid) + ellipsis, size) <= maxWidthPt) lo = mid;
		else hi = mid - 1;
	}
	return text.slice(0, lo).trimEnd() + ellipsis;
}
