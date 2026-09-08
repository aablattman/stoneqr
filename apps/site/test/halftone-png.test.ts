import { describe, expect, it } from 'vitest';
import { HALFTONE_MAX_SIDE, halftonePngSize } from '$lib/generator/halftone-png';

/** A version 7 code with the default quiet zone: what a short URL through Photo QR produces. */
const MODULES = 45 + 8;

describe('halftonePngSize', () => {
	it('prints at the requested width whether or not the cap holds', () => {
		for (const [widthMm, dpi] of [
			[30, 300],
			[50, 600],
			[250, 600],
			[300, 600]
		] as const) {
			const s = halftonePngSize(MODULES, widthMm, dpi);
			expect(s.widthPx).toBe(s.pxPerModule * MODULES);
			// The size the file opens at, from its own pixels and pHYs.
			expect((s.widthPx / s.dpi) * 25.4).toBeCloseTo(widthMm, 6);
		}
	});

	it('caps at 4096 px a side and says so, carrying a lower dpi than asked', () => {
		const s = halftonePngSize(MODULES, 250, 600);
		expect(s.capped).toBe(true);
		expect(s.widthPx).toBeLessThanOrEqual(HALFTONE_MAX_SIDE);
		expect(s.pxPerModule).toBe(Math.floor(HALFTONE_MAX_SIDE / MODULES));
		expect(s.dpi).toBeLessThan(600);
		// Before the fix this file said 600 dpi and opened at about 172 mm.
		expect((s.widthPx / 600) * 25.4).toBeLessThan(180);
	});

	it('leaves an uncapped file near the requested dpi', () => {
		const s = halftonePngSize(MODULES, 30, 300);
		expect(s.capped).toBe(false);
		expect(Math.abs(s.dpi - 300) / 300).toBeLessThan(0.1);
	});

	it('never goes below two pixels per module', () => {
		expect(halftonePngSize(MODULES, 1, 72).pxPerModule).toBe(2);
	});
});
