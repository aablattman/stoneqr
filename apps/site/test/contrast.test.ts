import { describe, expect, it } from 'vitest';
import { contrastRatio, summary } from '@stoneqr/engine';
import { weakestForeground } from '$lib/generator/contrast';

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
