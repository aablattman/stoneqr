/**
 * Bulk generation, off the main thread.
 *
 * Two jobs, both synchronous and both interruptible only by `terminate()` (see `client.ts`):
 *
 *  - `generate`: payload-encode, QR-encode and decode-verify every row, then hand back the
 *    metadata and one packed matrix buffer (see `protocol.ts` for the packing).
 *  - `render`: take those back and build a ZIP of SVGs or PNGs plus a manifest.
 *
 * The worker keeps nothing between messages, so cancelling a render cannot cost the page a
 * finished generation run. Nothing here touches the network; this file exists so a spreadsheet
 * of a thousand customer URLs can be turned into a thousand codes without the tab locking up.
 */
import { encode, exportPng, rasterize, renderSvg, verifyRaster, type EncodedQr } from '@stoneqr/engine';
import { zipSync, type Zippable } from 'fflate';
import { slug } from '$lib/download';
import { hexToRgb, normaliseHex } from '$lib/colour';
import {
	VERIFY_PX,
	csvCell,
	indexPrefix,
	matrixOffsets,
	packMatrix,
	packedLength,
	toPayload,
	unpackMatrix,
	type BulkItem,
	type BulkRequest,
	type BulkResponse,
	type BulkRow,
	type EncodeOptions,
	type RenderOptions
} from './protocol';

/**
 * Typed just enough to post and receive, rather than pulling in the WebWorker lib, which
 * collides with the DOM lib the rest of the app is checked against.
 */
const ctx = self as unknown as {
	postMessage(message: BulkResponse, transfer?: Transferable[]): void;
	onmessage: ((event: MessageEvent<BulkRequest>) => void) | null;
};

/** Rows between progress messages. Small enough to look live, large enough not to spam. */
const PROGRESS_EVERY = 8;

function progress(phase: 'generate' | 'render', done: number, total: number): void {
	ctx.postMessage({ kind: 'progress', phase, done, total });
}

function reason(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

type Rgb = [number, number, number];

/** The colours the ZIP will use, or the defaults where a hex field is mid-edit, as `exportPng` falls back. */
function colours(opts: EncodeOptions): { fg: Rgb; bg: Rgb } {
	return {
		fg: normaliseHex(opts.fg) ? hexToRgb(opts.fg) : [0, 0, 0],
		bg: normaliseHex(opts.bg) ? hexToRgb(opts.bg) : [255, 255, 255]
	};
}

/**
 * Rasterise and decode, in the colours the files will be written in, so "verified" in the
 * manifest means the code as delivered and not a black-on-white stand-in. The check always uses
 * a 4-module quiet zone because it is testing the symbol, not the page layout; the printed quiet
 * zone is a separate setting with its own warning.
 */
function decodes(qr: Pick<EncodedQr, 'matrix' | 'size'>, payload: string, ink: { fg: Rgb; bg: Rgb }): boolean {
	try {
		return verifyRaster(rasterize(qr, { pxPerModule: VERIFY_PX, quietZone: 4, fg: ink.fg, bg: ink.bg }), payload).ok;
	} catch {
		return false;
	}
}

interface Attempt {
	encoded: EncodedQr;
	verified: boolean;
	remasked: boolean;
}

/**
 * Encode, then prove it reads back.
 *
 * `@paulmillr/qr`'s decoder has blind spots on particular mask patterns: roughly one symbol in
 * five hundred will not decode at the mask uqr picked automatically, yet decodes perfectly at
 * seven of the other eight. The mask does not change what the code says or how a phone reads it,
 * so rather than shipping a code marked "failed" we re-encode at another mask and keep the one
 * that verifies. CLAUDE.md: every download must pass a decode check. A row that fails at every
 * mask is a genuine failure and is reported as one.
 */
function encodeVerified(payload: string, opts: EncodeOptions): Attempt {
	const ink = colours(opts);
	const encoded = encode(payload, { ecc: opts.ecc });
	if (decodes(encoded, payload, ink)) return { encoded, verified: true, remasked: false };
	for (let mask = 0; mask < 8; mask++) {
		if (mask === encoded.mask) continue;
		let alt: EncodedQr;
		try {
			alt = encode(payload, { ecc: opts.ecc, mask });
		} catch {
			continue;
		}
		if (decodes(alt, payload, ink)) return { encoded: alt, verified: true, remasked: true };
	}
	return { encoded, verified: false, remasked: false };
}

function generate(rows: BulkRow[], opts: EncodeOptions): { items: BulkItem[]; bits: Uint8Array } {
	const total = rows.length;
	const items: BulkItem[] = [];
	const matrices: (boolean[][] | null)[] = [];

	for (let i = 0; i < total; i++) {
		const row = rows[i]!;
		let payload = row.payload;
		try {
			payload = toPayload(row.payload, opts.type);
			const attempt = encodeVerified(payload, opts);
			items.push({
				index: i,
				label: row.label,
				payload,
				version: attempt.encoded.version,
				size: attempt.encoded.size,
				verified: attempt.verified,
				remasked: attempt.remasked || undefined
			});
			matrices.push(attempt.encoded.matrix);
		} catch (e) {
			items.push({ index: i, label: row.label, payload, version: 0, size: 0, verified: false, error: reason(e) });
			matrices.push(null);
		}
		if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === total) progress('generate', i + 1, total);
	}

	const bits = new Uint8Array(packedLength(items));
	const offsets = matrixOffsets(items);
	for (let i = 0; i < items.length; i++) {
		const matrix = matrices[i];
		if (matrix) packMatrix(bits, offsets[i]!, matrix);
	}
	return { items, bits };
}

function renderZip(items: BulkItem[], bits: Uint8Array, opts: RenderOptions): Uint8Array {
	const offsets = matrixOffsets(items);
	const total = items.length;
	const files: Zippable = {};
	const manifest = ['index,label,payload,version,verified'];
	const encoder = new TextEncoder();

	for (let i = 0; i < total; i++) {
		const item = items[i]!;
		manifest.push(
			[
				String(item.index + 1),
				csvCell(item.label),
				csvCell(item.payload),
				item.version > 0 ? String(item.version) : '',
				String(item.size > 0 && item.verified)
			].join(',')
		);

		// A row that would not encode has no matrix and therefore no file, only a manifest line.
		if (item.size > 0) {
			const qr = { matrix: unpackMatrix(bits, offsets[i]!, item.size), size: item.size };
			const name = `${indexPrefix(i + 1, total)}-${slug(item.label || item.payload)}.${opts.format}`;
			files[name] =
				opts.format === 'svg'
					? encoder.encode(
							renderSvg(qr, {
								widthMm: opts.widthMm,
								quietZone: opts.quietZone,
								fg: opts.fg,
								bg: opts.bg,
								title: item.label || item.payload
							})
						)
					: exportPng(qr, {
							widthMm: opts.widthMm,
							dpi: opts.dpi,
							quietZone: opts.quietZone,
							fg: opts.fg,
							bg: opts.bg
						}).png;
		}
		if ((i + 1) % PROGRESS_EVERY === 0 || i + 1 === total) progress('render', i + 1, total);
	}

	files['manifest.csv'] = encoder.encode(manifest.join('\r\n') + '\r\n');
	// PNGs are already deflated, so a second pass only costs time. SVG text compresses well.
	return zipSync(files, { level: opts.format === 'png' ? 0 : 6 });
}

ctx.onmessage = (event: MessageEvent<BulkRequest>) => {
	const request = event.data;
	try {
		if (request.kind === 'generate') {
			const result = generate(request.rows, request.opts);
			ctx.postMessage({ kind: 'generated', items: result.items, bits: result.bits }, [
				result.bits.buffer as ArrayBuffer
			]);
		} else {
			const bytes = renderZip(request.items, request.bits, request.opts);
			ctx.postMessage({ kind: 'zip', format: request.opts.format, bytes }, [bytes.buffer as ArrayBuffer]);
		}
	} catch (e) {
		ctx.postMessage({ kind: 'failed', message: reason(e) });
	}
};
