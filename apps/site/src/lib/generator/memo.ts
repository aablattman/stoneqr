/**
 * Remembered work for the preview: decode verdicts and rendered codes, keyed on exactly what went
 * into them, so switching back to a design already seen shows its badge and its picture at once
 * instead of waiting out a debounce and a decode. Nothing here changes what is checked, only
 * whether the same check runs twice: a verdict is stored only after a real decode of the same
 * bytes, and a key covers every input that could alter the output, so a hit is the very code
 * that decoded (or did not) before.
 *
 * Entries are bounded by bytes rather than by count, because one styled SVG with a logo inside
 * it or one Artistic QR raster can weigh a megabyte while a plain verdict weighs nothing. The
 * least recently used entry goes first. Everything lives in module scope, so the memory survives
 * the Preview remounting and client-side navigation between the landing pages, which share one
 * design.
 *
 * Pure: no DOM, tested in `apps/site/test/memo.test.ts`.
 */
import type { HalftoneResult } from '@stoneqr/engine';
import type { StyledResult } from '$lib/styled';

export class Memo<V> {
	private readonly map = new Map<string, { value: V; bytes: number }>();
	private bytes = 0;

	/**
	 * @param maxBytes Total weight the memo may hold before evicting.
	 * @param maxEntries Cap on the number of entries, whatever they weigh.
	 */
	constructor(
		readonly maxBytes: number,
		readonly maxEntries = 64
	) {}

	get size(): number {
		return this.map.size;
	}

	get weight(): number {
		return this.bytes;
	}

	/** The remembered value, marking it as recently used; `undefined` when there is none. */
	get(key: string): V | undefined {
		const hit = this.map.get(key);
		if (!hit) return undefined;
		// A Map iterates in insertion order, so re-inserting moves the entry to the young end.
		this.map.delete(key);
		this.map.set(key, hit);
		return hit.value;
	}

	has(key: string): boolean {
		return this.map.has(key);
	}

	/**
	 * Remember a value at the given weight. A value heavier than the whole budget is not kept at
	 * all rather than evicting everything for it.
	 */
	set(key: string, value: V, bytes = 1): void {
		if (bytes > this.maxBytes) return;
		const old = this.map.get(key);
		if (old) {
			this.bytes -= old.bytes;
			this.map.delete(key);
		}
		this.map.set(key, { value, bytes });
		this.bytes += bytes;
		while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
			const oldest = this.map.keys().next().value as string;
			this.bytes -= this.map.get(oldest)!.bytes;
			this.map.delete(oldest);
		}
	}

	clear(): void {
		this.map.clear();
		this.bytes = 0;
	}
}

/**
 * A short fingerprint of a string, so a data URL or an SVG a megabyte long can sit in a key
 * without the key holding the string itself. cyrb53, bryc's public-domain 53-bit hash: two of
 * the few dozen strings a memo ever holds at once collide with odds around one in 10^13, and the
 * length is appended so the fingerprint carries the size too.
 */
export function fingerprint(s: string): string {
	const cached = fingerprints.get(s);
	if (cached) return cached;
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < s.length; i++) {
		const ch = s.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
	h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
	h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const out = `${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}.${s.length.toString(36)}`;
	remember(s, out);
	return out;
}

/**
 * The last few strings fingerprinted, so a logo or picture that is the same string on every
 * render is hashed once, not on every keystroke elsewhere in the design. Keyed on the string
 * itself: a Map hashes it once per instance and V8 caches that hash on the string.
 */
const fingerprints = new Map<string, string>();
const FINGERPRINTS_KEPT = 8;
function remember(s: string, out: string): void {
	// Short strings are cheaper to hash again than to keep.
	if (s.length < 4096) return;
	if (fingerprints.size >= FINGERPRINTS_KEPT) fingerprints.delete(fingerprints.keys().next().value as string);
	fingerprints.set(s, out);
}

/**
 * A key from a plain record. `JSON.stringify` keeps the fields in the order written and drops
 * `undefined`, so build the record as one literal at the call site and it stays one key.
 */
export function keyOf(record: Record<string, unknown>): string {
	return JSON.stringify(record);
}

/** A decode verdict for one exact rendering: true when it read back as the payload. Weightless, so count-bound. */
export const verdicts = new Memo<boolean>(1 << 20, 256);

/** Styled SVGs by their option set: the string the library produced, which carries the logo inside it. */
export const styledRenders = new Memo<StyledResult>(24 * 1024 * 1024, 48);

/** Artistic QR results with the PNG the preview shows, by picture and option set. */
export const halftoneRenders = new Memo<HalftoneRender>(48 * 1024 * 1024, 32);

export interface HalftoneRender {
	result: HalftoneResult;
	/** The raster as a PNG, so a hit shows at once without re-encoding it. */
	blob: Blob;
}

/** What one Artistic QR render weighs in the memo: its pixels and its PNG. */
export function halftoneWeight(render: HalftoneRender): number {
	return render.result.raster.data.byteLength + render.blob.size;
}
