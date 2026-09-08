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
 * A silhouette's shape sits between the dots, so it is judged on two pairs neither of which is
 * "an ink against the paper": the shape against the background decides whether it shows at all,
 * and the code colour against the shape decides whether the dark dots survive. The two need
 * opposite advice, so the rule reports which one is worse as well as the ratio (§8j).
 */
describe('shapeContrast', () => {
	it('reports the code pair when the shape is close to the code colour', () => {
		const r = shapeContrast('#000000', '#111111', '#ffffff');
		expect(r.worst).toBe('code');
		expect(r.ratio).toBeLessThan(4);
		// The shape reads fine against the paper; it is the dots inside it that vanish.
		expect(contrastRatio('#111111', '#ffffff')).toBeGreaterThan(4);
	});

	it('reports the background pair when the shape is close to the paper', () => {
		const r = shapeContrast('#000000', '#f2f2f2', '#ffffff');
		expect(r.worst).toBe('background');
		expect(r.ratio).toBeLessThan(4);
	});

	it('is judged at the graphical-object bar, not the code\'s', () => {
		// Why the shape is not held to CONTRAST_MIN: under a black code on white, clearing 4:1 on
		// both pairs needs the shape between about 0.15 and 0.21 luminance, and almost nothing
		// lands there. The site's own accent teal is 3.5:1 and perfectly usable.
		expect(SHAPE_CONTRAST_MIN).toBeLessThan(4);
		const teal = shapeContrast('#000000', '#1f6f63', '#ffffff');
		expect(teal.ratio).toBeCloseTo(3.51, 1);
		expect(teal.ratio).toBeGreaterThan(SHAPE_CONTRAST_MIN);
		// A mid grey is one of the few things that would have cleared 4:1.
		expect(shapeContrast('#000000', '#7d7d7d', '#ffffff').ratio).toBeGreaterThan(4);
		// What the bar does catch: a shape all but identical to the code, or to the paper.
		expect(shapeContrast('#000000', '#111111', '#ffffff').ratio).toBeLessThan(SHAPE_CONTRAST_MIN);
		expect(shapeContrast('#000000', '#f2f2f2', '#ffffff').ratio).toBeLessThan(SHAPE_CONTRAST_MIN);
	});

	it('treats a transparent background as white paper, as the sizing rules do', () => {
		expect(shapeContrast('#000000', '#f2f2f2', 'transparent')).toEqual(shapeContrast('#000000', '#f2f2f2', '#ffffff'));
	});

	it('is at its worst when the shape simply is the code colour', () => {
		// What "Same as code" produces; the panel stays silent there because the shape is the code.
		expect(shapeContrast('#1f6f63', '#1f6f63', '#ffffff')).toEqual({ ratio: 1, worst: 'code' });
	});
});
