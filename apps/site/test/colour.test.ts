import { describe, expect, it } from 'vitest';
import { hexToHsv, hexToRgb, hsvToHex, isLight, normaliseHex, rgbToHex, rgbToHsv } from '$lib/colour';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The site's own tokens, which the picker offers as swatches. */
const SITE = ['#f4f0e8', '#1b1917', '#1f6f63', '#a8551b', '#a3301d', '#d6cfc2'];

describe('normaliseHex', () => {
	it('accepts three and six digits with or without the hash', () => {
		expect(normaliseHex('#abc')).toBe('#aabbcc');
		expect(normaliseHex('abc')).toBe('#aabbcc');
		expect(normaliseHex('#AABBCC')).toBe('#aabbcc');
		expect(normaliseHex(' aabbcc ')).toBe('#aabbcc');
	});

	it('rejects anything else', () => {
		for (const bad of ['', '#', 'ab', '#abcd', '#abcdefg', 'xyz', '#12345', 'rgb(0,0,0)']) {
			expect(normaliseHex(bad), bad).toBeNull();
		}
	});
});

describe('hex and rgb', () => {
	it('round trips', () => {
		for (const hex of [...SITE, '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff']) {
			expect(rgbToHex(...hexToRgb(hex))).toBe(hex);
		}
	});

	it('clamps and rounds out-of-range components', () => {
		expect(rgbToHex(-10, 255.4, 300)).toBe('#00ffff');
	});

	it('falls back to black on unparseable input', () => {
		expect(hexToRgb('nope')).toEqual([0, 0, 0]);
	});
});

describe('hsv', () => {
	it('round trips every site colour and the edges', () => {
		for (const hex of [...SITE, '#000000', '#ffffff', '#7f7f7f']) {
			expect(hsvToHex(hexToHsv(hex)), hex).toBe(hex);
		}
	});

	it('round trips the pure hues', () => {
		for (const hex of ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']) {
			expect(hsvToHex(hexToHsv(hex)), hex).toBe(hex);
		}
	});

	it('reads the known hues off the wheel', () => {
		expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 });
		expect(rgbToHsv(0, 255, 0).h).toBe(120);
		expect(rgbToHsv(0, 0, 255).h).toBe(240);
		expect(rgbToHsv(0, 255, 255).h).toBe(180);
	});

	it('treats greys as hueless with zero saturation', () => {
		expect(rgbToHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 });
		expect(rgbToHsv(255, 255, 255)).toEqual({ h: 0, s: 0, v: 1 });
	});

	it('keeps hue while dragging brightness to zero and back', () => {
		// The picker holds h and s while v moves, so a drag to the bottom of the square must not
		// lose the hue the user chose.
		const hsv = hexToHsv('#1f6f63');
		expect(hsvToHex({ ...hsv, v: 0 })).toBe('#000000');
		expect(hsvToHex({ ...hsv, v: hexToHsv('#1f6f63').v })).toBe('#1f6f63');
	});

	it('wraps hue past the ends', () => {
		expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
		expect(hsvToHex({ h: -60, s: 1, v: 1 })).toBe('#ff00ff');
	});
});

describe('isLight', () => {
	it('separates paper from ink', () => {
		expect(isLight('#f4f0e8')).toBe(true);
		expect(isLight('#ffffff')).toBe(true);
		expect(isLight('#1b1917')).toBe(false);
		expect(isLight('#1f6f63')).toBe(false);
	});
});

/**
 * Every colour a user can set goes through `ColourField`, which validates with `normaliseHex`
 * before the value moves. `/bulk` did not until 2026-09-06: a native `<input type=color>` beside
 * a text box bound straight to `fg` and `bg`, so an unprefixed `1f6f63` reached the encoder and
 * the whole batch printed black (item A7 of `docs/audit-2026-09-06.md`). The rule is easy to
 * break again by hand-rolling markup for a new colour, and nothing else would catch it, so it is
 * pinned here rather than remembered.
 */
describe('no native colour input', () => {
	const src = fileURLToPath(new URL('../src/', import.meta.url));

	function walk(dir: string): string[] {
		return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
			e.isDirectory() ? walk(`${dir}${e.name}/`) : /\.(svelte|ts)$/.test(e.name) ? [`${dir}${e.name}`] : []
		);
	}

	it('is used nowhere in the site source', () => {
		const offenders = walk(src).filter((f) => /type=(["'])color\1/.test(readFileSync(f, 'utf8')));
		expect(offenders.map((f) => f.slice(src.length))).toEqual([]);
	});
});
