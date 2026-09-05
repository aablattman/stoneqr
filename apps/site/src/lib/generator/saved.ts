/**
 * Saved designs: the working design, given a name and kept.
 *
 * `persist.ts` keeps one design, the one being worked on, and forgets it on "Start over". This
 * module keeps any number, each under a name, so the cafe's WiFi code and the menu's URL can
 * both be reopened next month. A saved design is the same record the autosave and the share
 * link use (`Saved`), plus its two pictures, a name, dates, and a small plain-SVG thumbnail
 * for the list.
 *
 * Everything lives in IndexedDB, pictures included. localStorage would be the wrong place for
 * them: its quota is about 5 MB of text for the whole origin, one photo can be that on its own,
 * and a failed write there drops everything. IndexedDB's quota is a share of the disk, and the
 * record and its pictures are written in one transaction, so a design is saved whole or not
 * at all. The pictures sit in their own store keyed `<id>/logo` and `<id>/halftone`, so listing
 * the designs reads the small records only.
 *
 * Nothing here leaves the browser. A saved design can also be written to a file (`toFile`) and
 * read back (`fromFile`): that is the copy that survives a cleared browser, Safari's storage
 * expiry, or a move to another device, and it is plain JSON so nothing is lost with StoneQR.
 */
import type { PayloadType } from '@stoneqr/engine/payloads';
import { openDb, STORES, type Saved } from './persist';
import type { Fields } from './state.svelte';

export type SavedDesign = {
	id: string;
	name: string;
	/** ms since the epoch */
	created: number;
	updated: number;
	type: PayloadType;
	/** The plain single-path SVG of the code at save time, a few KB, for the list. */
	thumb: string;
	record: Saved;
	/** Which pictures sit beside the record, so the list can say so without reading them. */
	hasLogo: boolean;
	hasHalftone: boolean;
};

export type Pictures = { logo?: string; halftone?: string };

/** What a save takes. `id` given: update that design in place, keeping its creation date. */
export type SaveInput = Pictures & {
	id?: string;
	name: string;
	type: PayloadType;
	thumb: string;
	record: Saved;
};

/** The largest picture a file may carry: the same order as a phone photo, well inside IndexedDB's quota. */
const MAX_PICTURE = 24 * 1024 * 1024;
const MAX_NAME = 120;

export function newId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---- names -------------------------------------------------------------------------------------

/**
 * A name to offer when saving, from what was typed: the site for a URL, the network for WiFi,
 * the person for a contact, and so on. Never empty, so the Save button always has something to
 * save under.
 */
export function suggestName(type: PayloadType, fields: Fields): string {
	const f = fields as unknown as Record<string, Record<string, string>>;
	const first = (...xs: (string | undefined)[]) => xs.map((x) => (x ?? '').trim()).find(Boolean) ?? '';
	let name = '';
	switch (type) {
		case 'url': {
			const raw = first(f.url?.url);
			try {
				const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
				name = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
			} catch {
				name = raw;
			}
			break;
		}
		case 'text':
			name = first(f.text?.text);
			break;
		case 'wifi':
			name = first(f.wifi?.ssid) && `${f.wifi.ssid.trim()} WiFi`;
			break;
		case 'vcard':
		case 'mecard': {
			const c = f[type] ?? {};
			name = first([c.firstName, c.lastName].filter(Boolean).join(' '), c.org, c.email);
			break;
		}
		case 'email':
			name = first(f.email?.subject, f.email?.to);
			break;
		case 'sms':
			name = first(f.sms?.to);
			break;
		case 'tel':
			name = first(f.tel?.number);
			break;
		case 'geo':
			name = first(f.geo?.query, f.geo?.lat && `${f.geo.lat}, ${f.geo.lng}`);
			break;
		case 'event':
			name = first(f.event?.summary);
			break;
	}
	return tidyName(name) || LABEL[type];
}

const LABEL: Record<PayloadType, string> = {
	url: 'Website',
	text: 'Text',
	wifi: 'WiFi',
	vcard: 'Contact',
	mecard: 'Contact',
	email: 'Email',
	sms: 'Message',
	tel: 'Phone number',
	geo: 'Location',
	event: 'Event'
};

/** One line, trimmed, at most MAX_NAME characters. */
export function tidyName(s: string): string {
	return s.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

// ---- IndexedDB ---------------------------------------------------------------------------------

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((res, rej) => {
		req.onsuccess = () => res(req.result);
		req.onerror = () => rej(req.error);
	});
}

function done(t: IDBTransaction): Promise<void> {
	return new Promise((res, rej) => {
		t.oncomplete = () => res();
		t.onerror = () => rej(t.error);
		t.onabort = () => rej(t.error ?? new Error('aborted'));
	});
}

/** Every saved design, newest change first, without pictures. Empty where IndexedDB is missing. */
export async function listSaved(): Promise<SavedDesign[]> {
	try {
		const db = await openDb();
		try {
			const all = await request(db.transaction(STORES.designs, 'readonly').objectStore(STORES.designs).getAll());
			return (all as unknown[]).filter(isSavedDesign).sort((a, b) => b.updated - a.updated);
		} finally {
			db.close();
		}
	} catch {
		return [];
	}
}

/**
 * Save a design, record and pictures together, in one transaction. Throws when the browser
 * refuses (storage full, private mode, no IndexedDB); the caller shows the reason.
 */
export async function saveDesign(input: SaveInput): Promise<SavedDesign> {
	const db = await openDb();
	try {
		const t = db.transaction([STORES.designs, STORES.designImages], 'readwrite');
		const designs = t.objectStore(STORES.designs);
		const images = t.objectStore(STORES.designImages);
		const id = input.id ?? newId();
		const now = Date.now();
		const previous = input.id ? ((await request(designs.get(id))) as SavedDesign | undefined) : undefined;
		const design: SavedDesign = {
			id,
			name: tidyName(input.name) || LABEL[input.type],
			created: previous?.created ?? now,
			updated: now,
			type: input.type,
			thumb: input.thumb,
			record: input.record,
			hasLogo: !!input.logo,
			hasHalftone: !!input.halftone
		};
		designs.put(design, id);
		if (input.logo) images.put(input.logo, `${id}/logo`);
		else images.delete(`${id}/logo`);
		if (input.halftone) images.put(input.halftone, `${id}/halftone`);
		else images.delete(`${id}/halftone`);
		await done(t);
		return design;
	} finally {
		db.close();
	}
}

export async function renameSaved(id: string, name: string): Promise<void> {
	const db = await openDb();
	try {
		const t = db.transaction(STORES.designs, 'readwrite');
		const store = t.objectStore(STORES.designs);
		const current = (await request(store.get(id))) as SavedDesign | undefined;
		if (!current) return;
		const next = tidyName(name);
		if (next) store.put({ ...current, name: next }, id);
		await done(t);
	} finally {
		db.close();
	}
}

export async function deleteSaved(id: string): Promise<void> {
	const db = await openDb();
	try {
		const t = db.transaction([STORES.designs, STORES.designImages], 'readwrite');
		t.objectStore(STORES.designs).delete(id);
		t.objectStore(STORES.designImages).delete(`${id}/logo`);
		t.objectStore(STORES.designImages).delete(`${id}/halftone`);
		await done(t);
	} finally {
		db.close();
	}
}

export async function readPictures(id: string): Promise<Pictures> {
	try {
		const db = await openDb();
		try {
			const store = db.transaction(STORES.designImages, 'readonly').objectStore(STORES.designImages);
			const [logo, halftone] = await Promise.all([request(store.get(`${id}/logo`)), request(store.get(`${id}/halftone`))]);
			return { logo: isPicture(logo) ? logo : undefined, halftone: isPicture(halftone) ? halftone : undefined };
		} finally {
			db.close();
		}
	} catch {
		return {};
	}
}

function isSavedDesign(v: unknown): v is SavedDesign {
	if (!v || typeof v !== 'object') return false;
	const d = v as Record<string, unknown>;
	return (
		typeof d.id === 'string' &&
		typeof d.name === 'string' &&
		typeof d.created === 'number' &&
		typeof d.updated === 'number' &&
		typeof d.type === 'string' &&
		typeof d.thumb === 'string' &&
		!!d.record &&
		typeof d.record === 'object' &&
		(d.record as Saved).v === 1
	);
}

function isPicture(v: unknown): v is string {
	return typeof v === 'string' && v.startsWith('data:image/') && v.length <= MAX_PICTURE;
}

// ---- files -------------------------------------------------------------------------------------

/**
 * A saved design as a file: the record with its pictures, in plain JSON. The `stoneqr` key
 * names the format so a stray JSON file is refused politely, and the version lets a later
 * StoneQR read today's files.
 */
export type DesignFile = Pictures & {
	stoneqr: 1;
	name: string;
	type: PayloadType;
	record: Saved;
};

export const FILE_SUFFIX = '.stoneqr.json';

export function toFile(design: Pick<SavedDesign, 'name' | 'type' | 'record'>, pictures: Pictures): string {
	const out: DesignFile = { stoneqr: 1, name: design.name, type: design.type, record: design.record };
	if (pictures.logo) out.logo = pictures.logo;
	if (pictures.halftone) out.halftone = pictures.halftone;
	return JSON.stringify(out);
}

/**
 * The design in a file's text, or null when it is not one of ours. The record itself is only
 * checked for its version here; `persist.apply` validates every field when it is opened, so a
 * hand-edited file cannot put a string where a number goes. Pictures must be image data URLs.
 */
export function fromFile(text: string): DesignFile | null {
	try {
		const parsed = JSON.parse(text);
		if (!parsed || typeof parsed !== 'object' || parsed.stoneqr !== 1) return null;
		const p = parsed as Record<string, unknown>;
		if (!p.record || typeof p.record !== 'object' || (p.record as Saved).v !== 1) return null;
		const type = typeof p.type === 'string' && p.type in LABEL ? (p.type as PayloadType) : 'url';
		const out: DesignFile = {
			stoneqr: 1,
			name: tidyName(typeof p.name === 'string' ? p.name : '') || LABEL[type],
			type,
			record: p.record as Saved
		};
		if (isPicture(p.logo)) out.logo = p.logo;
		if (isPicture(p.halftone)) out.halftone = p.halftone;
		return out;
	} catch {
		return null;
	}
}

// ---- which saved design is open ----------------------------------------------------------------

/**
 * The saved design the working design came from, if any, with the record as it was when it was
 * saved or opened. The generator compares the live snapshot with `json` to know whether there
 * is anything to update. Kept in localStorage beside the working design, so a reload still
 * knows which design is open.
 */
export type Opened = { id: string; name: string; json: string };
const OPENED_KEY = 'stoneqr.opened';

export function readOpened(): Opened | null {
	try {
		const raw = localStorage.getItem(OPENED_KEY);
		if (!raw) return null;
		const p = JSON.parse(raw);
		return p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.json === 'string' ? (p as Opened) : null;
	} catch {
		return null;
	}
}

export function writeOpened(opened: Opened | null): void {
	try {
		if (opened) localStorage.setItem(OPENED_KEY, JSON.stringify(opened));
		else localStorage.removeItem(OPENED_KEY);
	} catch {
		/* private mode or storage disabled */
	}
}
