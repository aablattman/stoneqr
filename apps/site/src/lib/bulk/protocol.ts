/**
 * The contract between the bulk page and its Web Worker, plus the shapes both sides share.
 *
 * ## How matrices cross the worker boundary
 *
 * A run of 2,000 codes is 2,000 matrices of roughly 33 x 33 booleans. Sent as `boolean[][]`
 * that is two million single-element arrays to structured-clone, which is slow and allocates
 * heavily on both sides. Instead every matrix is packed, row-major, one byte per module
 * (1 = dark, 0 = light), into a **single flat `Uint8Array`** holding all items end to end in
 * item order. Each item carries its own `size` (modules per side); an item's slice therefore
 * starts at the running sum of `size * size` over the items before it, which is what
 * `matrixOffsets` computes. Items that failed to encode have `size: 0` and occupy no bytes.
 *
 * That is one ~2 MB buffer, transferable in both directions, instead of 2,000 nested arrays.
 * `unpackMatrix` turns a slice back into the `boolean[][]` the engine's renderers and
 * `layoutLabels` expect.
 *
 * The worker holds no state between messages: a render request carries the items and the bits
 * back to it. That keeps cancellation honest, because cancelling terminates the worker outright
 * and the page never loses a finished generation run.
 */
import type { Ecc } from '@stoneqr/engine';
import { text as textPayload, url as urlPayload } from '@stoneqr/engine/payloads';

/** Rows beyond this are dropped, with a message. A run this size is already ~5 s of work. */
export const MAX_ROWS = 2000;

/** Pixels per module used for the decode check. Enough for `@paulmillr/qr` to lock on. */
export const VERIFY_PX = 6;

/** Bulk is deliberately limited to the two types that make sense a thousand at a time. */
export type BulkPayloadType = 'url' | 'text';

/** One line of input, before any payload encoding. */
export interface BulkRow {
	/** The raw first column. */
	payload: string;
	/** The optional second column, used for the file name and the label caption. */
	label: string;
}

export interface EncodeOptions {
	type: BulkPayloadType;
	ecc: Ecc;
	/**
	 * The colours the files will be written in, hex. The decode check rasterises in them, so a
	 * pair a phone cannot tell apart fails the check rather than passing as black on white.
	 */
	fg: string;
	bg: string;
}

export interface RenderOptions {
	format: 'svg' | 'png';
	/** Printed width of the whole symbol including the quiet zone, in mm. */
	widthMm: number;
	/** Target resolution for PNG output. Ignored for SVG. */
	dpi: number;
	quietZone: number;
	fg: string;
	bg: string;
}

/** One generated code. Everything the summary, the manifest, and the label layout need. */
export interface BulkItem {
	/** 0-based position in the parsed input, so failures can be pointed at by row number. */
	index: number;
	label: string;
	/** The payload as encoded, i.e. after `url()` or `text()` ran on the raw column. */
	payload: string;
	/** 1..40, or 0 when the row could not be encoded. */
	version: number;
	/** Modules per side, or 0 when the row could not be encoded. */
	size: number;
	/** Did a rasterised copy decode back to `payload`? */
	verified: boolean;
	/** Why the row produced no code, when it did not. */
	error?: string;
	/**
	 * True when uqr's chosen mask would not decode and a different, equally valid mask was
	 * used instead. Informational; the symbol is standard-conformant either way.
	 */
	remasked?: boolean;
}

export type BulkRequest =
	| { kind: 'generate'; rows: BulkRow[]; opts: EncodeOptions }
	| { kind: 'render'; items: BulkItem[]; bits: Uint8Array; opts: RenderOptions };

export type BulkResponse =
	| { kind: 'progress'; phase: 'generate' | 'render'; done: number; total: number }
	| { kind: 'generated'; items: BulkItem[]; bits: Uint8Array }
	| { kind: 'zip'; format: 'svg' | 'png'; bytes: Uint8Array }
	| { kind: 'failed'; message: string };

/** Byte offset into the packed `bits` buffer for each item, in item order. */
export function matrixOffsets(items: readonly BulkItem[]): number[] {
	const offsets = new Array<number>(items.length);
	let at = 0;
	for (let i = 0; i < items.length; i++) {
		offsets[i] = at;
		at += items[i]!.size * items[i]!.size;
	}
	return offsets;
}

/** Total packed length for a set of items, i.e. the size of the `bits` buffer they need. */
export function packedLength(items: readonly BulkItem[]): number {
	let n = 0;
	for (const item of items) n += item.size * item.size;
	return n;
}

/** Write one matrix into `bits` at `offset`, row-major, one byte per module. */
export function packMatrix(bits: Uint8Array, offset: number, matrix: readonly boolean[][]): void {
	const size = matrix.length;
	for (let y = 0; y < size; y++) {
		const row = matrix[y]!;
		const base = offset + y * size;
		for (let x = 0; x < size; x++) bits[base + x] = row[x] ? 1 : 0;
	}
}

/** Read one matrix back out of `bits`, as the `boolean[][]` the engine renderers expect. */
export function unpackMatrix(bits: Uint8Array, offset: number, size: number): boolean[][] {
	const matrix: boolean[][] = new Array(size);
	for (let y = 0; y < size; y++) {
		const row: boolean[] = new Array(size);
		const base = offset + y * size;
		for (let x = 0; x < size; x++) row[x] = bits[base + x] === 1;
		matrix[y] = row;
	}
	return matrix;
}

/**
 * Turn a raw input column into the exact string to encode.
 * Throws `PayloadError` on input the type cannot represent, which the caller reports per row.
 */
export function toPayload(raw: string, type: BulkPayloadType): string {
	return type === 'url' ? urlPayload(raw) : textPayload(raw);
}

/** One CSV field, quoted only when it has to be. Excel and Numbers both read this. */
export function csvCell(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** `001`, `002`, … wide enough for the whole run and never narrower than three digits. */
export function indexPrefix(oneBased: number, total: number): string {
	return String(oneBased).padStart(Math.max(3, String(total).length), '0');
}
