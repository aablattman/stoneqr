import { describe, expect, it } from 'vitest';
import { contrastRatio, summary } from '@stoneqr/engine';
import { shapeContrast, SHAPE_CONTRAST_MIN, weakestForeground } from '$lib/generator/contrast';

/**
 * The sizing rules treat a transparent background as white paper, so the weakest of the code
 * and corner colours has to be picked against white in that mode too; before 2026-09-06 the
 * corner colour was skipped whenever the background was transparent, and pale finder patterns
 * raised no warning.
 */
describe('weakestForeground', () => {
	it('follows the code colour while no corner colour is set', () => {
		expect(weakestForeground('#000000', null, '#ffffff')).toBe('#000000');
		expect(weakestForeground('#000000', null, 'transparent')).toBe('#000000');
	});

	it('picks whichever colour reads worse against the background', () => {
		expect(weakestForeground('#000000', '#dddddd', '#ffffff')).toBe('#dddddd');
		expect(weakestForeground('#cccccc', '#000000', '#ffffff')).toBe('#cccccc');
		// Against a dark background the pale corners are the strong colour.
		expect(weakestForeground('#333333', '#dddddd', '#000000')).toBe('#333333');
	});

	it('compares against white paper when the background is transparent', () => {
		const weakest = weakestForeground('#000000', '#dddddd', 'transparent');
		expect(weakest).toBe('#dddddd');
		expect(contrastRatio(weakest, '#ffffff')).toBeLessThan(4);
		// And the sizing badge sees it: pale corners on transparent are no longer print-safe.
		expect(summary({ widthMm: 50, size: 25, quiet: 4, fg: weakest, bg: 'transparent' })).not.toBe('print-safe');
		expect(summary({ widthMm: 50, size: 25, quiet: 4, fg: '#000000', bg: 'transparent' })).toBe('print-safe');
	});
});

/**
 * Only the background pair is checked, which is a correction to the first version of this rule.
 * A shape close to the code colour reads as solid ink with the light dots punched through it —
 * the classic silhouette, and what the built-in shapes are for — so warning about it was wrong.
 * A shape close to the paper is the real failure: there is nothing left to see (§8j).
 */
describe('shapeContrast', () => {
	it('is happy with a shape the same colour as the code', () => {
		// The default: a black shape under a black code. Solid ink with light dots punched
		// through it, which is the look people pick a built-in shape for.
		expect(shapeContrast('#000000', '#ffffff')).toBeGreaterThan(SHAPE_CONTRAST_MIN);
	});

	it('catches a shape that disappears into the paper', () => {
		expect(shapeContrast('#f2f2f2', '#ffffff')).toBeLessThan(SHAPE_CONTRAST_MIN);
		expect(shapeContrast('#ffffff', '#ffffff')).toBe(1);
	});

	it('is judged at the graphical-object bar, not the code\'s', () => {
		// Why not CONTRAST_MIN: the site's own accent teal is 5.98:1 against white and perfectly
		// usable, but plenty of usable mid-tones sit between 3 and 4, and the shape cannot cost a
		// scan anything, so the stricter bar would only produce noise.
		expect(SHAPE_CONTRAST_MIN).toBeLessThan(4);
		expect(shapeContrast('#1f6f63', '#ffffff')).toBeGreaterThan(SHAPE_CONTRAST_MIN);
		expect(shapeContrast('#8a8a8a', '#ffffff')).toBeGreaterThan(SHAPE_CONTRAST_MIN);
	});

	it('treats a transparent background as white paper, as the sizing rules do', () => {
		expect(shapeContrast('#f2f2f2', 'transparent')).toEqual(shapeContrast('#f2f2f2', '#ffffff'));
	});
});
