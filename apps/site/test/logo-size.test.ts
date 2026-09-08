import { describe, it, expect } from 'vitest';
import { alignmentCount, budgetModules, predictHole, fitLogo, NO_LOGO } from '../src/lib/logo-size';

/**
 * Every expected hole and logo width below was read out of `@liquid-js/qr-code-styling`'s own
 * SVG output, by rendering through `renderStyled` in a browser and measuring the `<image>` the
 * library wrote (2026-09-05, library 5.5.0). They are not derived from the port. If a library
 * update changes `calculateImageSize`, these fail instead of every saved design quietly
 * resizing.
 */

const SQUARE = 1;

describe('alignmentCount', () => {
	it('matches the standard table', () => {
		expect(alignmentCount(1)).toBe(0);
		for (const v of [2, 3, 6]) expect(alignmentCount(v)).toBe(2);
		for (const v of [7, 13]) expect(alignmentCount(v)).toBe(3);
		for (const v of [14, 20]) expect(alignmentCount(v)).toBe(4);
		for (const v of [21, 27]) expect(alignmentCount(v)).toBe(5);
		for (const v of [28, 34]) expect(alignmentCount(v)).toBe(6);
		for (const v of [35, 40]) expect(alignmentCount(v)).toBe(7);
	});
});

describe('budgetModules', () => {
	it('is the library"s accounting of hideable modules', () => {
		// 29² − 192 − 2(29 − 16) − 2²·25
		expect(budgetModules(29, 3)).toBe(523);
		// 69² − 192 − 2(69 − 16) − 3²·25
		expect(budgetModules(69, 13)).toBe(4238);
	});
});

describe('predictHole against the rendered library output', () => {
	const v3 = { modules: 29, version: 3, ecc: 'H' as const, aspect: SQUARE };
	const v13 = { modules: 69, version: 13, ecc: 'H' as const, aspect: SQUARE };

	it('reproduces a version 3 code at margin 1', () => {
		const at = (coefficient: number) => predictHole({ ...v3, margin: 1, coefficient });
		expect(at(0.15)).toMatchObject({ hideX: 3, hideY: 3, logoW: 1 });
		expect(at(0.25)).toMatchObject({ hideX: 5, hideY: 5, logoW: 3 });
		expect(at(0.35)).toMatchObject({ hideX: 7, hideY: 7, logoW: 5 });
		// The slider's old top half was inert: three different values, one result.
		expect(at(0.45)).toMatchObject({ hideX: 7, hideY: 7, logoW: 5 });
		expect(at(0.5)).toMatchObject({ hideX: 7, hideY: 7, logoW: 5 });
		expect(at(0.7)).toMatchObject({ hideX: 9, hideY: 9, logoW: 7 });
		expect(at(1)).toMatchObject({ hideX: 11, hideY: 11, logoW: 9 });
	});

	it('reproduces a version 3 code at margin 0', () => {
		const at = (coefficient: number) => predictHole({ ...v3, margin: 0, coefficient });
		expect(at(0.15)).toMatchObject({ hideX: 3, logoW: 3 });
		expect(at(0.35)).toMatchObject({ hideX: 7, logoW: 7 });
		expect(at(0.5)).toMatchObject({ hideX: 7, logoW: 7 });
	});

	it('reproduces a version 13 code', () => {
		expect(predictHole({ ...v13, margin: 1, coefficient: 0.35 })).toMatchObject({ hideX: 21, logoW: 19 });
		expect(predictHole({ ...v13, margin: 1, coefficient: 0.5 })).toMatchObject({ hideX: 25, logoW: 23 });
	});

	it('reproduces a wide picture, which gets a wide hole', () => {
		// A 400 × 100 wordmark: the library cut 9 across and 5 down, and drew 7 × 1.8.
		const hole = predictHole({ ...v3, margin: 1, coefficient: 0.35, aspect: 100 / 400 });
		expect(hole).toMatchObject({ hideX: 9, hideY: 5, logoW: 7 });
		expect(hole.logoH).toBeCloseTo(1.8, 2);
	});

	it('mirrors a wide picture for a tall one', () => {
		const wide = predictHole({ ...v3, margin: 1, coefficient: 0.35, aspect: 0.25 });
		const tall = predictHole({ ...v3, margin: 1, coefficient: 0.35, aspect: 4 });
		expect(tall.hideX).toBe(wide.hideY);
		expect(tall.hideY).toBe(wide.hideX);
		expect(tall.logoH).toBeCloseTo(wide.logoW, 6);
	});

	it('lowers the budget with the error-correction level', () => {
		const h = predictHole({ ...v3, margin: 1, coefficient: 1, ecc: 'H' });
		const m = predictHole({ ...v3, margin: 1, coefficient: 1, ecc: 'M' });
		expect(m.logoW).toBeLessThan(h.logoW);
	});

	it('returns nothing when there is no room or no picture', () => {
		expect(predictHole({ ...v3, margin: 1, coefficient: 0 })).toEqual(NO_LOGO_HOLE);
		expect(predictHole({ ...v3, margin: 4, coefficient: 0.01 })).toEqual(NO_LOGO_HOLE);
		expect(predictHole({ ...v3, margin: 1, coefficient: 0.35, aspect: 0 })).toEqual(NO_LOGO_HOLE);
	});
});

const NO_LOGO_HOLE = { hideX: 0, hideY: 0, logoW: 0, logoH: 0 };

describe('fitLogo', () => {
	const v3 = { modules: 29, version: 3, ecc: 'H' as const, aspect: SQUARE, margin: 1 };
	const v13 = { modules: 69, version: 13, ecc: 'H' as const, aspect: SQUARE, margin: 1 };

	it('lands on the nearest reachable width, not the requested one', () => {
		// 29 modules: the treads are 1, 3, 5, 7, 9 modules wide.
		expect(fitLogo(0.2, v3).logoW).toBe(5); // 5.8 asked, 5 is nearer than 7
		expect(fitLogo(0.24, v3).logoW).toBe(7); // 6.96 asked
		expect(fitLogo(0.32, v3).logoW).toBe(9); // 9.28 asked
	});

	it('reports the width it reached, not the width it was given', () => {
		const fit = fitLogo(0.2, v3);
		expect(fit.width).toBeCloseTo(5 / 29, 6);
		expect(fit.logoW / fit.width).toBeCloseTo(29, 6);
	});

	it('measures cover against the same budget the library rations', () => {
		const fit = fitLogo(0.2, v3);
		// A 7 × 7 hole out of 523 hideable modules.
		expect(fit.hideX).toBe(7);
		expect(fit.cover).toBeCloseTo(49 / 523, 6);
		expect(fit.area).toBeCloseTo(49 / 841, 6);
	});

	it('never asks the library for more than it will give', () => {
		for (const input of [v3, v13]) {
			const fit = fitLogo(0.32, input);
			expect(predictHole({ ...input, coefficient: fit.coefficient })).toMatchObject({
				hideX: fit.hideX,
				logoW: fit.logoW
			});
		}
	});

	it('stays inside the H budget even at the top of the range', () => {
		for (const input of [v3, v13]) expect(fitLogo(0.32, input).cover).toBeLessThan(0.3);
	});

	it('gives a finer staircase on a denser code', () => {
		const widths = new Set<number>();
		for (let t = 0.1; t <= 0.32001; t += 0.005) widths.add(fitLogo(t, v13).logoW);
		expect(widths.size).toBeGreaterThan(4);
	});

	it('has nothing to fit without a target or a code', () => {
		expect(fitLogo(0, v3)).toBe(NO_LOGO);
		expect(fitLogo(0.2, { ...v3, modules: 0 })).toBe(NO_LOGO);
	});
});
