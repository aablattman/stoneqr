import { zlibSync } from 'fflate';
import { rasterize } from '../raster.js';
import type { EncodedQr, RasterImage } from '../types.js';

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Byte offset of the first chunk after IHDR: 8 signature + 4 length + 4 type + 13 data + 4 CRC. */
const AFTER_IHDR = 33;

/** Inches per metre, the PNG spec's unit for pHYs. */
const INCHES_PER_METRE = 39.3701;

let crcTable: Uint32Array | undefined;

function getCrcTable(): Uint32Array {
	if (crcTable) return crcTable;
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	crcTable = t;
	return t;
}

/** Standard PNG/zlib CRC-32 over `bytes`, returned as an unsigned 32-bit number. */
export function crc32(bytes: Uint8Array): number {
	const t = getCrcTable();
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
	target[offset] = (value >>> 24) & 0xff;
	target[offset + 1] = (value >>> 16) & 0xff;
	target[offset + 2] = (value >>> 8) & 0xff;
	target[offset + 3] = value & 0xff;
}

function readU32(source: Uint8Array, offset: number): number {
	return (
		((source[offset]! << 24) | (source[offset + 1]! << 16) | (source[offset + 2]! << 8) | source[offset + 3]!) >>> 0
	);
}

function typeBytes(type: string): Uint8Array {
	const b = new Uint8Array(4);
	for (let i = 0; i < 4; i++) b[i] = type.charCodeAt(i);
	return b;
}

/** A complete PNG chunk: length, type, data, CRC. */
function chunk(type: string, data: Uint8Array): Uint8Array {
	const out = new Uint8Array(12 + data.length);
	writeU32(out, 0, data.length);
	out.set(typeBytes(type), 4);
	out.set(data, 8);
	writeU32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}

/**
 * The full pHYs chunk (length, type, data, CRC) for a given DPI.
 * Pixels per metre = round(dpi * 39.3701) on both axes; unit specifier 1 means "metre".
 */
export function physChunk(dpi: number): Uint8Array {
	const ppu = Math.round(dpi * INCHES_PER_METRE);
	const data = new Uint8Array(9);
	writeU32(data, 0, ppu);
	writeU32(data, 4, ppu);
	data[8] = 1;
	return chunk('pHYs', data);
}

function isPng(png: Uint8Array): boolean {
	if (png.length < AFTER_IHDR) return false;
	for (let i = 0; i < 8; i++) if (png[i] !== PNG_SIGNATURE[i]) return false;
	return true;
}

/**
 * Insert (or replace) the pHYs chunk of an existing PNG so it opens at the requested DPI.
 * Used in the browser on canvas-produced PNGs, where we cannot control the encoder.
 * The chunk always lands immediately after IHDR, at byte offset 33.
 */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
	if (!isPng(png)) throw new Error('Not a PNG: bad signature');

	// Walk the chunk list after IHDR, dropping any existing pHYs.
	const tail: Uint8Array[] = [];
	let offset = AFTER_IHDR;
	while (offset + 8 <= png.length) {
		const length = readU32(png, offset);
		const end = offset + 12 + length;
		if (end > png.length) break;
		const type = String.fromCharCode(png[offset + 4]!, png[offset + 5]!, png[offset + 6]!, png[offset + 7]!);
		if (type !== 'pHYs') tail.push(png.subarray(offset, end));
		offset = end;
	}

	const phys = physChunk(dpi);
	const head = png.subarray(0, AFTER_IHDR);
	let size = head.length + phys.length;
	for (const c of tail) size += c.length;
	const out = new Uint8Array(size);
	out.set(head, 0);
	out.set(phys, head.length);
	let at = head.length + phys.length;
	for (const c of tail) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

/**
 * A pure PNG writer: 8-bit RGBA, filter type 0 on every scanline, deflate via fflate.
 * No canvas, so it runs in Node, Workers, and the main thread alike.
 * Accepts RGB (3 bytes per pixel) or RGBA input; the output is always RGBA.
 */
export function encodePng(image: RasterImage, opts: { dpi?: number } = {}): Uint8Array {
	const { width, height, data } = image;
	if (width <= 0 || height <= 0) throw new Error('encodePng: width and height must be positive');
	const channels = data.length / (width * height);
	if (channels !== 3 && channels !== 4)
		throw new Error(`encodePng: expected 3 or 4 bytes per pixel, got ${channels}`);

	// Raw scanlines: one filter byte (0 = none) then RGBA pixels.
	const stride = width * 4;
	const raw = new Uint8Array(height * (stride + 1));
	for (let y = 0; y < height; y++) {
		let o = y * (stride + 1);
		raw[o++] = 0;
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels;
			raw[o++] = data[i]!;
			raw[o++] = data[i + 1]!;
			raw[o++] = data[i + 2]!;
			raw[o++] = channels === 4 ? data[i + 3]! : 255;
		}
	}

	const ihdrData = new Uint8Array(13);
	writeU32(ihdrData, 0, width);
	writeU32(ihdrData, 4, height);
	ihdrData[8] = 8; // bit depth
	ihdrData[9] = 6; // colour type: truecolour with alpha
	ihdrData[10] = 0; // compression: deflate
	ihdrData[11] = 0; // filter method 0
	ihdrData[12] = 0; // no interlace

	const parts: Uint8Array[] = [PNG_SIGNATURE, chunk('IHDR', ihdrData)];
	if (opts.dpi !== undefined) parts.push(physChunk(opts.dpi));
	parts.push(chunk('IDAT', zlibSync(raw, { level: 9 })));
	parts.push(chunk('IEND', new Uint8Array(0)));

	let size = 0;
	for (const p of parts) size += p.length;
	const out = new Uint8Array(size);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

/** The SVG renderer's spelling of no background, accepted here so one design value serves both. */
export function isTransparent(colour: string | undefined): boolean {
	const s = colour?.trim().toLowerCase();
	return s === 'transparent' || s === 'none';
}

/** Parse `#rgb`, `#rrggbb`, or the words black/white into an RGB triple. */
export function parseRgb(colour: string | undefined, fallback: [number, number, number]): [number, number, number] {
	if (!colour) return fallback;
	const s = colour.trim().toLowerCase();
	if (s === 'black') return [0, 0, 0];
	if (s === 'white') return [255, 255, 255];
	const hex = s.startsWith('#') ? s.slice(1) : s;
	if (/^[0-9a-f]{3}$/.test(hex)) {
		const r = hex[0]!;
		const g = hex[1]!;
		const b = hex[2]!;
		return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
	}
	if (/^[0-9a-f]{6}$/.test(hex)) {
		return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
	}
	return fallback;
}

export interface PngExportOptions {
	/** Printed width of the whole symbol including quiet zone, in mm. */
	widthMm: number;
	/** Target print resolution. Default 300. */
	dpi?: number;
	/** Quiet zone in modules. Default 4. */
	quietZone?: number;
	/** Dark colour, hex. Default '#000000'. */
	fg?: string;
	/** Light colour, hex, or 'transparent' for a PNG with no background. Default '#ffffff'. */
	bg?: string;
}

export interface PngExportResult {
	png: Uint8Array;
	/** Whole pixels per module, so every module has hard edges. */
	pxPerModule: number;
	/** Actual pixel width of the image (pxPerModule * (size + 2 * quietZone)). */
	widthPx: number;
}

/**
 * Export a print-ready PNG at a physical width.
 *
 * The pixel grid is snapped to whole pixels per module, so the image is usually a little
 * smaller than `widthMm / 25.4 * dpi`. The embedded pHYs chunk is then set to the resolution
 * that makes the file open at exactly `widthMm`, which keeps print size honest at the cost of
 * a slightly different effective DPI than the one requested.
 */
export function exportPng(
	qr: Pick<EncodedQr, 'matrix' | 'size'>,
	opts: PngExportOptions
): PngExportResult {
	const dpi = opts.dpi ?? 300;
	const quiet = opts.quietZone ?? 4;
	const total = qr.size + 2 * quiet;
	const requestedPx = Math.round((opts.widthMm / 25.4) * dpi);
	const pxPerModule = Math.max(1, Math.floor(requestedPx / total));
	const widthPx = pxPerModule * total;

	const transparent = isTransparent(opts.bg);
	const image = rasterize(qr, {
		pxPerModule,
		quietZone: quiet,
		fg: parseRgb(opts.fg, [0, 0, 0]),
		bg: transparent ? [255, 255, 255] : parseRgb(opts.bg, [255, 255, 255]),
		transparent
	});

	// The DPI that reproduces the requested physical width from the actual pixel count.
	const effectiveDpi = opts.widthMm > 0 ? widthPx / (opts.widthMm / 25.4) : dpi;
	return { png: encodePng(image, { dpi: effectiveDpi }), pxPerModule, widthPx };
}
