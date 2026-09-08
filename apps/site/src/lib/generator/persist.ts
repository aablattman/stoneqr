/**
 * Saving and sharing a design.
 *
 * Two jobs share one format. The design is kept in localStorage as you work, so closing the tab
 * or swiping away mid-gradient loses nothing; and the same record, deflated and base64url-coded,
 * is the share link (`stoneqr.app/#1.…`). A URL fragment is never sent to the server, so sharing
 * keeps the site's promise that nothing typed leaves the browser: the link carries the settings
 * and the typed content to whoever it is given to, and to no one else.
 *
 * Pictures (the logo and the Photo QR source) are data URLs of up to a few megabytes. They are
 * kept in IndexedDB beside the record rather than in it, because localStorage's quota is about
 * 5 MB and a single failed write would drop the whole design; and they are left out of the share
 * link, which says so.
 *
 * Nothing here touches Svelte's runtime: it is plain data in and out of `Design`, so it can be
 * tested in Node.
 */
import { type Design, type Fields, defaultFields } from './state.svelte';
import type { Ecc, LengthUnit } from '@stoneqr/engine';
import { PAYLOAD_TYPES, type PayloadType } from '@stoneqr/engine/payloads';
import type { CornerDotStyle, CornerSquareStyle, DotStyle, GradientKind } from '$lib/styled';

export const STORAGE_KEY = 'stoneqr.design';
export const HASH_PREFIX = '#1.';
/** A share link that could not be deflated (no CompressionStream) is plain base64url JSON. */
const HASH_PREFIX_PLAIN = '#0.';

/**
 * Every field of Design that a person set and that the page cannot work out again. Rendered
 * output, verification, the decoded raster, and the object URLs are derived and left out; the
 * two pictures are handled separately (see above).
 */
export const PERSISTED = [
	'type', 'eccChoice', 'minVersion', 'mask', 'quietZone',
	'width', 'unit', 'scanDistanceM', 'dpi',
	'fg', 'bg', 'cornerColor', 'transparentBg', 'dot', 'cornerSquare', 'cornerDot',
	'gradient', 'gradientTo', 'gradientAngleDeg',
	'logoName', 'logoWidth', 'logoAspect', 'logoKnockout', 'logoMargin',
	'frameEnabled', 'frameText', 'frameColor', 'frameTextColor',
	'halftone', 'halftoneImageName', 'halftoneDotScale', 'halftoneDim', 'halftoneGrayscale',
	'halftoneContrast', 'halftoneSilhouette', 'halftoneThreshold', 'shapeColor', 'halftoneZoom', 'halftoneOffsetX', 'halftoneOffsetY',
	'shortUrl'
] as const satisfies readonly (keyof Design)[];
type PersistedKey = (typeof PERSISTED)[number];

export type Saved = { v: 1; fields?: Partial<Fields> } & Partial<Pick<Design, PersistedKey>>;

/** A plain copy of what is worth keeping. The fields go through JSON, which also unwraps a reactive proxy. */
export function snapshot(design: Pick<Design, PersistedKey | 'fields'>): Saved {
	const out: Saved = { v: 1, fields: JSON.parse(JSON.stringify(design.fields)) };
	for (const k of PERSISTED) (out as Record<string, unknown>)[k] = design[k];
	return out;
}

/**
 * The same record with every default removed, so a share link only carries what was changed.
 * `defaults` is a fresh Design's snapshot; the event fields default to "next hour", which
 * differs by the minute, so an event's dates are always kept.
 */
export function compact(saved: Saved, defaults: Saved): Saved {
	const out: Saved = { v: 1 };
	for (const k of PERSISTED) if (saved[k] !== defaults[k]) (out as Record<string, unknown>)[k] = saved[k];
	const fields: Record<string, Record<string, unknown>> = {};
	for (const [type, group] of Object.entries(saved.fields ?? {})) {
		const base = (defaults.fields as Record<string, Record<string, unknown>> | undefined)?.[type] ?? {};
		const diff: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(group as Record<string, unknown>)) if (v !== base[k]) diff[k] = v;
		if (Object.keys(diff).length) fields[type] = diff;
	}
	if (Object.keys(fields).length) out.fields = fields as Partial<Fields>;
	return out;
}

/**
 * Write a saved record onto a design. Only keys of the right shape are taken: a record from an
 * older version, a hand-edited link, or a tampered one cannot put a string where a number goes.
 * Unknown keys are ignored, so a newer record still restores what this version understands.
 */
export function apply(design: Design, saved: unknown): boolean {
	if (!saved || typeof saved !== 'object' || (saved as Saved).v !== 1) return false;
	const s = saved as Record<string, unknown>;
	for (const k of PERSISTED) {
		if (!(k in s)) continue;
		const v = s[k];
		if (accepts(k, design[k], v)) (design as unknown as Record<string, unknown>)[k] = v;
	}
	if (s.fields && typeof s.fields === 'object') {
		const base = defaultFields() as unknown as Record<string, Record<string, unknown>>;
		const incoming = s.fields as Record<string, unknown>;
		for (const type of Object.keys(base)) {
			const group = incoming[type];
			if (!group || typeof group !== 'object') continue;
			for (const [k, dv] of Object.entries(base[type])) {
				const v = (group as Record<string, unknown>)[k];
				if (v !== undefined && typeof v === typeof dv) base[type][k] = v;
			}
		}
		design.fields = base as unknown as Fields;
	}
	return true;
}

/**
 * The keys that take one of a fixed set of words. Each set is a Record keyed by the type, so
 * adding a value to a union without adding it here is a type error rather than a silent drop.
 * A word outside its set is refused: `buildPayload` and the styled renderer switch on these, and
 * a share link is one edit away from a value nothing switches on.
 */
const keys = <T extends string>(r: Record<T, true>): ReadonlySet<string> => new Set(Object.keys(r));
const ALLOWED: Partial<Record<PersistedKey, ReadonlySet<string>>> = {
	type: new Set(PAYLOAD_TYPES.map((t): PayloadType => t.id)),
	eccChoice: keys<Ecc>({ L: true, M: true, Q: true, H: true }),
	unit: keys<LengthUnit>({ mm: true, cm: true, in: true }),
	dot: keys<DotStyle>({ square: true, rounded: true, dots: true, classy: true, 'extra-rounded': true }),
	cornerSquare: keys<CornerSquareStyle>({ square: true, 'extra-rounded': true, dot: true, classy: true }),
	cornerDot: keys<CornerDotStyle>({ square: true, dot: true, classy: true }),
	gradient: keys<GradientKind>({ none: true, linear: true, radial: true })
};

/** The keys that hold a colour. The pickers always write `#rrggbb`; a short form is let through, anything else is not a colour. */
const COLOUR_KEYS: ReadonlySet<PersistedKey> = new Set(['fg', 'bg', 'cornerColor', 'shapeColor', 'gradientTo', 'frameColor', 'frameTextColor']);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** The keys whose default is null, and the type they take when set. */
const NULLABLE: Partial<Record<PersistedKey, 'number' | 'string'>> = { scanDistanceM: 'number', cornerColor: 'string', shapeColor: 'string', shortUrl: 'string' };

/**
 * Nullable keys accept null; enumerated keys must be one of their words; colours must be hex;
 * everything else must match the current value's type. The finite and length limits apply
 * whatever the current value is, so a field that happens to be null cannot take a megabyte.
 */
function accepts(k: PersistedKey, current: unknown, v: unknown): boolean {
	if (v === null) return k in NULLABLE;
	const allowed = ALLOWED[k];
	if (allowed) return typeof v === 'string' && allowed.has(v);
	if (k === 'mask') return v === 'auto' || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 7);
	const expected = current === null ? NULLABLE[k] : typeof current;
	if (typeof v !== expected) return false;
	if (typeof v === 'number' && !Number.isFinite(v)) return false;
	if (typeof v === 'string' && v.length > 20000) return false;
	if (COLOUR_KEYS.has(k)) return typeof v === 'string' && HEX.test(v);
	return true;
}

// ---- localStorage ---------------------------------------------------------------------------

export function readSaved(): Saved | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' && parsed.v === 1 ? (parsed as Saved) : null;
	} catch {
		return null;
	}
}

/** False when the browser refused (private mode, storage disabled, or full), so the page can say the design is not being kept. */
export function writeSaved(saved: Saved): boolean {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
		return true;
	} catch {
		return false;
	}
}

export function clearSaved(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* nothing to clear */
	}
}

// ---- IndexedDB for the two pictures ----------------------------------------------------------

export type ImageKey = 'logo' | 'halftone';
const DB = 'stoneqr';
/**
 * Version 1 held `images`, the working design's two pictures. Version 2 adds the saved designs
 * (`designs`, the named records, and `designImages`, their pictures keyed `<id>/logo` and
 * `<id>/halftone`); see `saved.ts`. A store is only created when missing, so an upgrade from 1
 * keeps the pictures that are already there.
 */
const DB_VERSION = 2;
const STORE = 'images';
export const STORES = { images: STORE, designs: 'designs', designImages: 'designImages' } as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

export function openDb(): Promise<IDBDatabase> {
	return new Promise((res, rej) => {
		if (typeof indexedDB === 'undefined') return rej(new Error('no IndexedDB'));
		const req = indexedDB.open(DB, DB_VERSION);
		req.onupgradeneeded = () => {
			const db = req.result;
			for (const name of Object.values(STORES)) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
		};
		req.onsuccess = () => res(req.result);
		req.onerror = () => rej(req.error);
		req.onblocked = () => rej(new Error('blocked'));
	});
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
	return openDb()
		.then(
			(db) =>
				new Promise<T | undefined>((res, rej) => {
					const t = db.transaction(STORE, mode);
					const req = run(t.objectStore(STORE));
					req.onsuccess = () => res(req.result);
					req.onerror = () => rej(req.error);
					t.oncomplete = () => db.close();
				})
		);
}

/** A missing or unreadable store reads as no picture. */
export async function readImage(key: ImageKey): Promise<string | undefined> {
	const v = await tx<unknown>('readonly', (s) => s.get(key)).catch(() => undefined);
	return typeof v === 'string' ? v : undefined;
}
/** Rejects when the browser refuses the write (a full store, or no IndexedDB), so the caller can say so. */
export function writeImage(key: ImageKey, dataUrl: string | undefined): Promise<unknown> {
	return dataUrl ? tx('readwrite', (s) => s.put(dataUrl, key)) : tx('readwrite', (s) => s.delete(key));
}
/** Best effort: there is nothing to say if a clear fails. */
export function clearImages(): Promise<unknown> {
	return tx('readwrite', (s) => s.clear()).catch(() => undefined);
}

// ---- share links ------------------------------------------------------------------------------

const b64 = {
	encode(bytes: Uint8Array): string {
		let bin = '';
		for (const b of bytes) bin += String.fromCharCode(b);
		return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	},
	decode(text: string): Uint8Array {
		const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}
};

async function pipe(bytes: Uint8Array, stream: { readable: ReadableStream; writable: WritableStream }): Promise<Uint8Array> {
	const w = stream.writable.getWriter();
	void w.write(bytes);
	void w.close();
	return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** The URL fragment for a record: `#1.` plus deflated base64url JSON, or `#0.` plain where deflate is unavailable. */
export async function encodeHash(saved: Saved): Promise<string> {
	const json = new TextEncoder().encode(JSON.stringify(saved));
	if (typeof CompressionStream === 'undefined') return HASH_PREFIX_PLAIN + b64.encode(json);
	return HASH_PREFIX + b64.encode(await pipe(json, new CompressionStream('deflate-raw')));
}

/** The record in a fragment, or null when it is not one of ours or does not parse. */
export async function decodeHash(hash: string): Promise<Saved | null> {
	try {
		let json: Uint8Array;
		if (hash.startsWith(HASH_PREFIX)) {
			if (typeof DecompressionStream === 'undefined') return null;
			json = await pipe(b64.decode(hash.slice(HASH_PREFIX.length)), new DecompressionStream('deflate-raw'));
		} else if (hash.startsWith(HASH_PREFIX_PLAIN)) {
			json = b64.decode(hash.slice(HASH_PREFIX_PLAIN.length));
		} else return null;
		const parsed = JSON.parse(new TextDecoder().decode(json));
		return parsed && typeof parsed === 'object' && parsed.v === 1 ? (parsed as Saved) : null;
	} catch {
		return null;
	}
}

/** True for a fragment this module wrote. */
export function isDesignHash(hash: string): boolean {
	return hash.startsWith(HASH_PREFIX) || hash.startsWith(HASH_PREFIX_PLAIN);
}
