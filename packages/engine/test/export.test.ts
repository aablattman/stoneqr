import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { encode } from '../src/encode.js';
import { rasterize } from '../src/raster.js';
import { matrixToPath } from '../src/render/svg.js';
import { verifyRaster } from '../src/verify.js';
import { crc32, encodePng, exportPng, physChunk, setPngDpi } from '../src/export/png.js';
import { exportEps } from '../src/export/eps.js';
import { exportPdf, exportTestSheet } from '../src/export/pdf.js';
import type { RasterImage } from '../src/types.js';

const PAYLOAD = 'https://stoneqr.app/print-size';

function readU32(b: Uint8Array, o: number): number {
	return ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
}

function chunkTypes(png: Uint8Array): { type: string; offset: number }[] {
	const out: { type: string; offset: number }[] = [];
	let o = 8;
	while (o + 8 <= png.length) {
		const len = readU32(png, o);
		out.push({
			type: String.fromCharCode(png[o + 4]!, png[o + 5]!, png[o + 6]!, png[o + 7]!),
			offset: o
		});
		o += 12 + len;
	}
	return out;
}

/** Inflate IDAT, strip the per-scanline filter bytes (all filter 0), rebuild RGBA. */
function decodePng(png: Uint8Array): RasterImage {
	const width = readU32(png, 16);
	const height = readU32(png, 20);
	const idat: number[] = [];
	for (const { type, offset } of chunkTypes(png)) {
		if (type !== 'IDAT') continue;
		const len = readU32(png, offset);
		for (let i = 0; i < len; i++) idat.push(png[offset + 8 + i]!);
	}
	const raw = unzlibSync(Uint8Array.from(idat));
	const stride = width * 4;
	const data = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)]!;
		expect(filter).toBe(0);
		data.set(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride), y * stride);
	}
	return { width, height, data };
}

/** Concatenate a page's content streams into PostScript-ish text. */
async function pageContent(bytes: Uint8Array): Promise<string> {
	const doc = await PDFDocument.load(bytes, { updateMetadata: false });
	const page = doc.getPage(0);
	const contents = page.node.Contents();
	const parts = contents instanceof PDFArray ? contents.asArray() : [contents];
	let text = '';
	for (const part of parts) {
		const stream = doc.context.lookup(part);
		expect(stream).toBeInstanceOf(PDFRawStream);
		text += new TextDecoder().decode(decodePDFRawStream(stream as PDFRawStream).decode());
	}
	return text;
}

interface PdfRect {
	x: number;
	y: number;
	w: number;
	h: number;
	dark: boolean;
	/** 'k' for CMYK, 'rg' for RGB: the print shop cares which one the ink came from. */
	space: 'k' | 'rg';
}

/**
 * pdf-lib draws a rectangle as a translated path (`cm` then `m`/`l`/`h`/`f`), not a `re`.
 * Read each q...Q block back into a plain rectangle in page points, with its fill.
 */
function pdfRects(content: string): PdfRect[] {
	const out: PdfRect[] = [];
	for (const [, block] of content.matchAll(/^q$([\s\S]*?)^Q$/gm)) {
		const cmyk = block!.match(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) k$/m);
		const rgbFill = block!.match(/^([\d.]+) ([\d.]+) ([\d.]+) rg$/m);
		if (!cmyk && !rgbFill) continue;
		if (!/^f$/m.test(block!)) continue;
		let x = 0;
		let y = 0;
		for (const [, tx, ty] of block!.matchAll(/^1 0 0 1 ([\d.-]+) ([\d.-]+) cm$/gm)) {
			x += Number(tx);
			y += Number(ty);
		}
		const points = [...block!.matchAll(/^([\d.-]+) ([\d.-]+) [ml]$/gm)].map(([, px, py]) => [Number(px), Number(py)]);
		const w = Math.max(...points.map((p) => p[0]!));
		const h = Math.max(...points.map((p) => p[1]!));
		const dark = cmyk
			? Number(cmyk[4]) > 0.5
			: Number(rgbFill![1]) < 0.5 && Number(rgbFill![2]) < 0.5 && Number(rgbFill![3]) < 0.5;
		out.push({ x, y, w, h, dark, space: cmyk ? 'k' : 'rg' });
	}
	return out;
}

/** Paint the parsed rectangles into a raster, flipping the PDF's bottom-left origin. */
function rasterizeRects(rects: PdfRect[], sidePt: number, pxPerPt: number): RasterImage {
	const side = Math.round(sidePt * pxPerPt);
	const data = new Uint8Array(side * side * 4).fill(255);
	const to = (pt: number) => Math.round(pt * pxPerPt);
	for (const rect of rects) {
		const x0 = Math.max(0, to(rect.x));
		const x1 = Math.min(side, to(rect.x + rect.w));
		// PDF y is measured up from the bottom; the raster's y runs down.
		const y0 = Math.max(0, side - to(rect.y + rect.h));
		const y1 = Math.min(side, side - to(rect.y));
		const v = rect.dark ? 0 : 255;
		for (let y = y0; y < y1; y++)
			for (let x = x0; x < x1; x++) {
				const i = (y * side + x) * 4;
				data[i] = v;
				data[i + 1] = v;
				data[i + 2] = v;
			}
	}
	return { width: side, height: side, data };
}

describe('pHYs', () => {
	it('encodes 300 dpi exactly', () => {
		const c = physChunk(300);
		expect(c.length).toBe(21);
		expect(readU32(c, 0)).toBe(9);
		expect(String.fromCharCode(c[4]!, c[5]!, c[6]!, c[7]!)).toBe('pHYs');
		expect(readU32(c, 8)).toBe(11811);
		expect(readU32(c, 12)).toBe(11811);
		expect(c[16]).toBe(1);
		expect(readU32(c, 17)).toBe(crc32(c.subarray(4, 17)));
	});

	it('inserts after IHDR and replaces rather than duplicates', () => {
		const qr = encode(PAYLOAD);
		const bare = encodePng(rasterize(qr, { pxPerModule: 4 }));
		expect(chunkTypes(bare).some((c) => c.type === 'pHYs')).toBe(false);

		const once = setPngDpi(bare, 300);
		const first = chunkTypes(once);
		expect(first[1]).toEqual({ type: 'pHYs', offset: 33 });
		expect(first.filter((c) => c.type === 'pHYs').length).toBe(1);

		const twice = setPngDpi(once, 600);
		const second = chunkTypes(twice);
		expect(second.filter((c) => c.type === 'pHYs').length).toBe(1);
		expect(twice.length).toBe(once.length);
		expect(readU32(twice, 33 + 8)).toBe(Math.round(600 * 39.3701));
		expect(second.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);
	});

	it('rejects non-PNG input', () => {
		expect(() => setPngDpi(new Uint8Array(64), 300)).toThrow(/PNG/);
	});
});

describe('encodePng', () => {
	it('writes a valid header and decodes back to the payload', () => {
		const qr = encode(PAYLOAD, { ecc: 'M' });
		const image = rasterize(qr, { pxPerModule: 6 });
		const png = encodePng(image, { dpi: 300 });

		expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(readU32(png, 16)).toBe(image.width);
		expect(readU32(png, 20)).toBe(image.height);
		expect(png[24]).toBe(8); // bit depth
		expect(png[25]).toBe(6); // RGBA
		expect(chunkTypes(png).map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND']);

		expect(verifyRaster(decodePng(png), PAYLOAD)).toEqual({ ok: true, decoded: PAYLOAD });
	});

	it('accepts RGB input', () => {
		const rgba = rasterize(encode('rgb test'), { pxPerModule: 5 });
		const rgbData = new Uint8Array(rgba.width * rgba.height * 3);
		for (let i = 0; i < rgba.width * rgba.height; i++) {
			rgbData[i * 3] = rgba.data[i * 4]!;
			rgbData[i * 3 + 1] = rgba.data[i * 4 + 1]!;
			rgbData[i * 3 + 2] = rgba.data[i * 4 + 2]!;
		}
		const png = encodePng({ width: rgba.width, height: rgba.height, data: rgbData });
		expect(verifyRaster(decodePng(png), 'rgb test')).toEqual({ ok: true, decoded: 'rgb test' });
	});
});

describe('exportPng', () => {
	it('snaps to whole pixels per module', () => {
		const qr = encode(PAYLOAD, { ecc: 'M' });
		const total = qr.size + 8;
		const { png, pxPerModule, widthPx } = exportPng(qr, { widthMm: 30, dpi: 300 });

		const requested = Math.round((30 / 25.4) * 300);
		expect(Number.isInteger(pxPerModule)).toBe(true);
		expect(pxPerModule).toBe(Math.floor(requested / total));
		expect(widthPx).toBe(pxPerModule * total);
		expect(widthPx).toBeLessThanOrEqual(requested);
		expect(widthPx).toBeGreaterThan(requested - total);

		expect(readU32(png, 16)).toBe(widthPx);
		expect(chunkTypes(png)[1]!.type).toBe('pHYs');
		// The embedded resolution reproduces the requested 30 mm width.
		const ppu = readU32(png, 41);
		expect((widthPx / ppu) * 1000).toBeCloseTo(30, 1);
		expect(verifyRaster(decodePng(png), PAYLOAD)).toEqual({ ok: true, decoded: PAYLOAD });
	});

	it('honours colours and never drops below 1 px per module', () => {
		const qr = encode('tiny');
		const { pxPerModule } = exportPng(qr, { widthMm: 1, dpi: 72 });
		expect(pxPerModule).toBe(1);
		const inverted = exportPng(qr, { widthMm: 20, fg: '#003', bg: '#fff' });
		const px = decodePng(inverted.png);
		// Top-left of the symbol (past the quiet zone) is a dark finder module in #000033.
		const i = (inverted.pxPerModule * 4 * px.width + inverted.pxPerModule * 4) * 4;
		expect([px.data[i], px.data[i + 1], px.data[i + 2]]).toEqual([0, 0, 51]);
	});
});

describe('exportEps', () => {
	it('writes a transparent background when asked, and the file still decodes', () => {
		const qr = encode(PAYLOAD);
		const { png, pxPerModule } = exportPng(qr, { widthMm: 30, bg: 'transparent' });
		const px = decodePng(png);
		const at = (x: number, y: number) => Array.from(px.data.subarray((y * px.width + x) * 4, (y * px.width + x) * 4 + 4));
		// The quiet zone is light: white underneath, fully transparent on top.
		expect(at(0, 0)).toEqual([255, 255, 255, 0]);
		// The top-left finder pattern starts four modules in and is dark and opaque.
		const finder = 4 * pxPerModule + 1;
		expect(at(finder, finder)).toEqual([0, 0, 0, 255]);
		expect(verifyRaster(px, PAYLOAD)).toEqual({ ok: true, decoded: PAYLOAD });
		// Opaque by default: the same pixel carries the light colour with full alpha.
		const opaque = decodePng(exportPng(qr, { widthMm: 30 }).png);
		expect(Array.from(opaque.data.subarray(0, 4))).toEqual([255, 255, 255, 255]);
	});

	it('emits a well-formed EPS with one rectfill per merged run', () => {
		const qr = encode(PAYLOAD);
		const eps = exportEps(qr, { widthMm: 30, title: 'Print size guide' });
		const runs = (matrixToPath(qr.matrix).match(/M/g) ?? []).length;

		expect(eps.startsWith('%!PS-Adobe-3.0 EPSF-3.0\n')).toBe(true);
		const box = Math.ceil((30 * 72) / 25.4);
		expect(eps).toContain(`%%BoundingBox: 0 0 ${box} ${box}`);
		expect(eps).toContain('%%HiResBoundingBox: 0 0 85.0394 85.0394');
		expect(eps).toContain('%%Creator: StoneQR');
		expect(eps).toContain('%%Title: Print size guide');
		expect(eps).toContain('%%EndComments');
		expect(eps).toContain('0 0 0 1 setcmykcolor');
		// One background rect plus one per merged dark run.
		expect((eps.match(/rectfill/g) ?? []).length).toBe(runs + 1);
		expect(eps.trimEnd().endsWith('%%EOF')).toBe(true);
	});

	it('places the rectangles so the symbol still decodes (y axis flipped)', () => {
		const qr = encode(PAYLOAD);
		const total = qr.size + 8;
		const widthMm = 30;
		const sidePt = (widthMm * 72) / 25.4;
		const eps = exportEps(qr, { widthMm });

		// Replay the PostScript rectfills into a raster at 8 px per module, then decode it.
		const px = 8;
		const side = total * px;
		const toPx = (pt: number) => Math.round((pt / sidePt) * side);
		const data = new Uint8Array(side * side * 4).fill(255);
		const rects = [...eps.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) rectfill$/gm)].slice(1);
		for (const [, xs, ys, ws, hs] of rects) {
			const x0 = toPx(Number(xs));
			const w = toPx(Number(ws));
			const h = toPx(Number(hs));
			// PostScript y is measured up from the bottom; the raster's y runs down.
			const y0 = side - toPx(Number(ys)) - h;
			for (let y = y0; y < y0 + h; y++)
				for (let x = x0; x < x0 + w; x++) {
					const i = (y * side + x) * 4;
					data[i] = 0;
					data[i + 1] = 0;
					data[i + 2] = 0;
				}
		}
		expect(verifyRaster({ width: side, height: side, data }, PAYLOAD)).toEqual({
			ok: true,
			decoded: PAYLOAD
		});
	});

	it('uses RGB and skips the background when asked', () => {
		const qr = encode('rgb');
		const eps = exportEps(qr, { widthMm: 20, cmyk: false, bg: 'transparent', fg: '#ff0000' });
		expect(eps).not.toContain('setcmykcolor');
		expect(eps).toContain('1 0 0 setrgbcolor');
		const runs = (matrixToPath(qr.matrix).match(/M/g) ?? []).length;
		expect((eps.match(/rectfill/g) ?? []).length).toBe(runs);
	});
});

describe('exportPdf', () => {
	it('produces a single page sized to the code plus margin', async () => {
		const qr = encode(PAYLOAD);
		const bytes = await exportPdf(qr, { widthMm: 30, marginMm: 5, title: 'Print size guide' });
		const doc = await PDFDocument.load(bytes, { updateMetadata: false });

		expect(doc.getPageCount()).toBe(1);
		const page = doc.getPage(0);
		expect(page.getWidth()).toBeCloseTo((40 * 72) / 25.4, 3);
		expect(page.getHeight()).toBeCloseTo((40 * 72) / 25.4, 3);
		expect(doc.getTitle()).toBe('Print size guide');
		expect(doc.getProducer()).toBe('StoneQR');
		expect(doc.getCreator()).toBe('stoneqr.app');
	});

	it('places the modules so the page still decodes, in 100% K ink', async () => {
		const qr = encode(PAYLOAD);
		const widthMm = 30;
		const marginMm = 5;
		const bytes = await exportPdf(qr, { widthMm, marginMm });
		const rects = pdfRects(await pageContent(bytes));

		// One background plus one per merged dark run, same as the EPS.
		const runs = (matrixToPath(qr.matrix).match(/M/g) ?? []).length;
		expect(rects.length).toBe(runs + 1);
		// Every drop of ink is CMYK 100% K; only the untouched paper is RGB white.
		expect(rects.filter((r) => r.dark).every((r) => r.space === 'k')).toBe(true);
		expect(rects.filter((r) => r.space !== 'k')).toEqual([
			expect.objectContaining({ dark: false, x: 0, y: 0 })
		]);

		const sidePt = ((widthMm + 2 * marginMm) * 72) / 25.4;
		const pxPerPt = ((qr.size + 8) * 8) / ((widthMm * 72) / 25.4);
		expect(verifyRaster(rasterizeRects(rects, sidePt, pxPerPt), PAYLOAD)).toEqual({
			ok: true,
			decoded: PAYLOAD
		});
	});

	it('decodes with a transparent background and RGB ink', async () => {
		const payload = 'https://stoneqr.app/wifi';
		const widthMm = 25;
		const qr = encode(payload);
		const bytes = await exportPdf(qr, { widthMm, marginMm: 4, bg: 'transparent', fg: '#123456', cmyk: true });
		const rects = pdfRects(await pageContent(bytes));

		// No paper rectangle at all, and #123456 is too light for the CMYK black shortcut.
		const runs = (matrixToPath(qr.matrix).match(/M/g) ?? []).length;
		expect(rects.length).toBe(runs);
		expect(rects.every((r) => r.space === 'rg' && r.dark)).toBe(true);

		const sidePt = ((widthMm + 8) * 72) / 25.4;
		const pxPerPt = ((qr.size + 8) * 8) / ((widthMm * 72) / 25.4);
		expect(verifyRaster(rasterizeRects(rects, sidePt, pxPerPt), payload).ok).toBe(true);
	});
});

describe('exportTestSheet', () => {
	it('lays out the default sizes on one page', async () => {
		const qr = encode(PAYLOAD);
		const bytes = await exportTestSheet(qr, { label: 'Lobby sign, links to the visitor guide' });
		const doc = await PDFDocument.load(bytes, { updateMetadata: false });
		expect(doc.getPageCount()).toBe(1);
		expect(doc.getPage(0).getWidth()).toBeCloseTo(612, 3);
		expect(doc.getTitle()).toBe('StoneQR print test sheet');
	});

	it('wraps six sizes without throwing, on A4 too', async () => {
		const qr = encode(PAYLOAD);
		const sizes = [10, 15, 20, 30, 50, 80];
		for (const pageSize of ['Letter', 'A4'] as const) {
			const bytes = await exportTestSheet(qr, { sizesMm: sizes, pageSize, label: 'Six sizes' });
			const doc = await PDFDocument.load(bytes);
			expect(doc.getPageCount()).toBe(1);
		}
	});
});
