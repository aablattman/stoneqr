import { describe, expect, it } from 'vitest';
import { PERSISTED, snapshot, compact, apply, encodeHash, decodeHash, isDesignHash, type Saved } from '$lib/generator/persist';
import { buildPayload, defaultFields, type Design } from '$lib/generator/state.svelte';

/** A plain stand-in for Design with the persisted fields at their defaults. */
function fake(): Design {
	return {
		type: 'url', eccChoice: 'M', minVersion: 1, mask: 'auto', quietZone: 4,
		width: 50, unit: 'mm', scanDistanceM: null, dpi: 300,
		fg: '#000000', bg: '#ffffff', cornerColor: null, transparentBg: false,
		dot: 'square', cornerSquare: 'square', cornerDot: 'square',
		gradient: 'none', gradientTo: '#1f6f63', gradientAngleDeg: 45,
		logoName: '', logoWidth: 0.2, logoAspect: 1, logoKnockout: true, logoMargin: 1,
		frameEnabled: false, frameText: 'Scan me', frameColor: '#000000', frameTextColor: '#ffffff',
		halftone: false, halftoneImageName: '', halftoneDotScale: 0.4, halftoneDim: 0, halftoneGrayscale: false,
		halftoneContrast: 1, halftoneSilhouette: false, halftoneThreshold: 0.5, halftoneZoom: 1, halftoneOffsetX: 0, halftoneOffsetY: 0,
		shortUrl: null,
		fields: defaultFields()
	} as unknown as Design;
}

describe('persist', () => {
	it('round-trips a snapshot through apply', () => {
		const a = fake();
		a.type = 'wifi';
		a.fields.wifi.ssid = 'Cafe';
		a.fields.wifi.password = 'latte';
		a.fg = '#123456';
		a.cornerColor = '#ff0000';
		a.gradient = 'linear';
		a.mask = 3;
		a.scanDistanceM = 2.5;
		const b = fake();
		expect(apply(b, snapshot(a))).toBe(true);
		expect(snapshot(b)).toEqual(snapshot(a));
	});

	it('compacts to what differs from the defaults and restores the same design', () => {
		const d = fake();
		const a = fake();
		a.dot = 'dots';
		a.fields.url.url = 'https://example.com';
		const c = compact(snapshot(a), snapshot(d));
		expect(Object.keys(c).sort()).toEqual(['dot', 'fields', 'v']);
		expect(c.fields).toEqual({ url: { url: 'https://example.com' } });
		const b = fake();
		apply(b, c);
		expect(snapshot(b)).toEqual(snapshot(a));
	});

	it('ignores values of the wrong shape and unknown keys', () => {
		const b = fake();
		const bad = { v: 1, width: 'wide', mask: 9, fg: 12, cornerColor: null, dpi: Infinity, nonsense: true, fields: { wifi: { ssid: 7, hidden: 'yes' }, bogus: {} } } as unknown as Saved;
		expect(apply(b, bad)).toBe(true);
		expect(b.width).toBe(50);
		expect(b.mask).toBe('auto');
		expect(b.fg).toBe('#000000');
		expect(b.dpi).toBe(300);
		expect(b.fields.wifi.ssid).toBe('');
		expect(b.fields.wifi.hidden).toBe(false);
		expect('nonsense' in b).toBe(false);
	});

	it('refuses a word outside an enumerated field, and keeps one inside it', () => {
		const b = fake();
		const bad = { v: 1, type: 'bogus', eccChoice: 'X', unit: 'furlong', dot: 'hexagon', cornerSquare: 'star', cornerDot: 'heart', gradient: 'conic' } as unknown as Saved;
		expect(apply(b, bad)).toBe(true);
		expect(b.type).toBe('url');
		expect(b.eccChoice).toBe('M');
		expect(b.unit).toBe('mm');
		expect(b.dot).toBe('square');
		expect(b.cornerSquare).toBe('square');
		expect(b.cornerDot).toBe('square');
		expect(b.gradient).toBe('none');
		const good = { v: 1, type: 'event', eccChoice: 'H', unit: 'in', dot: 'classy', cornerSquare: 'dot', cornerDot: 'classy', gradient: 'radial' } as Saved;
		expect(apply(b, good)).toBe(true);
		expect(b.type).toBe('event');
		expect(b.eccChoice).toBe('H');
		expect(b.unit).toBe('in');
		expect(b.dot).toBe('classy');
		expect(b.cornerSquare).toBe('dot');
		expect(b.cornerDot).toBe('classy');
		expect(b.gradient).toBe('radial');
	});

	it('holds null-default fields to the same limits and colours to hex', () => {
		const b = fake();
		const bad = { v: 1, cornerColor: 'x'.repeat(30000), shortUrl: 'y'.repeat(30000), scanDistanceM: Infinity, fg: 'red', bg: '#12345', gradientTo: 'url(#x)' } as unknown as Saved;
		expect(apply(b, bad)).toBe(true);
		expect(b.cornerColor).toBeNull();
		expect(b.shortUrl).toBeNull();
		expect(b.scanDistanceM).toBeNull();
		expect(b.fg).toBe('#000000');
		expect(b.bg).toBe('#ffffff');
		expect(b.gradientTo).toBe('#1f6f63');
		const good = { v: 1, cornerColor: '#ABC', shortUrl: 'https://s.example/x', scanDistanceM: 2.5, fg: '#123456', frameColor: '#fff' } as Saved;
		expect(apply(b, good)).toBe(true);
		expect(b.cornerColor).toBe('#ABC');
		expect(b.shortUrl).toBe('https://s.example/x');
		expect(b.scanDistanceM).toBe(2.5);
		expect(b.fg).toBe('#123456');
		expect(b.frameColor).toBe('#fff');
		// And back to null, which is how the pickers say "follow the code colour".
		expect(apply(b, { v: 1, cornerColor: null } as Saved)).toBe(true);
		expect(b.cornerColor).toBeNull();
	});

	it('gives an unknown payload type an empty result rather than none', () => {
		// The second fence behind `apply`: a design must never be left without a payload result.
		const r = buildPayload('bogus' as never, defaultFields(), null);
		expect(r).toEqual({ payload: '', error: null, warnings: [], empty: true });
	});

	it('rejects records that are not ours', () => {
		const b = fake();
		expect(apply(b, null)).toBe(false);
		expect(apply(b, { v: 2 })).toBe(false);
		expect(apply(b, 'x')).toBe(false);
	});

	it('lists every persisted key on the stand-in', () => {
		const b = fake();
		for (const k of PERSISTED) expect(k in b, k).toBe(true);
	});

	it('encodes a share link that decodes to the same record', async () => {
		const a = fake();
		a.type = 'text';
		a.fields.text.text = 'Ünïcödé and emoji 🎉';
		a.bg = '#fffbe6';
		const saved = compact(snapshot(a), snapshot(fake()));
		const hash = await encodeHash(saved);
		expect(isDesignHash(hash)).toBe(true);
		expect(hash).toMatch(/^#1\.[A-Za-z0-9_-]+$/);
		expect(await decodeHash(hash)).toEqual(saved);
	});

	it('returns null for a fragment that is not a design', async () => {
		expect(await decodeHash('#generator')).toBeNull();
		expect(await decodeHash('#1.not-base64-deflate!!')).toBeNull();
		expect(isDesignHash('#1')).toBe(false);
	});
});
