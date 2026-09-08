import { describe, expect, it } from 'vitest';
import {
	CONTRAST_MIN,
	MODULE_MM_GOOD,
	MODULE_MM_WARN,
	assess,
	contrastRatio,
	formatMm,
	fromMm,
	isInverted,
	isReddish,
	maxScanDistanceM,
	minWidthMmForDistance,
	minWidthMmForModule,
	moduleMm,
	parseColor,
	relativeLuminance,
	statusFor,
	summary,
	toMm
} from '../src/sizing.js';

const find = (ws: ReturnType<typeof assess>, code: string) => ws.filter((w) => w.code === code);

describe('sizing formulas', () => {
	it('sizes modules from the printed width and the quiet zone', () => {
		// Version 3 is 29 modules; at 30 mm with a 4-module quiet zone that is 30 / 37.
		expect(moduleMm(30, 29)).toBeCloseTo(0.81, 2);
		expect(moduleMm(30, 29, 0)).toBeCloseTo(30 / 29, 5);
		expect(moduleMm(15, 29, 4)).toBeCloseTo(15 / 37, 5);
	});

	it('applies the 10:1 scan-distance rule', () => {
		expect(maxScanDistanceM(40)).toBeCloseTo(0.4, 5);
		expect(maxScanDistanceM(30)).toBeCloseTo(0.3, 5);
	});

	it('adds a 25% safety margin to the minimum width for a distance', () => {
		expect(minWidthMmForDistance(2)).toBe(250);
		expect(minWidthMmForDistance(2, 1)).toBe(200);
	});

	it('reports the smallest width that keeps modules above a floor', () => {
		expect(minWidthMmForModule(29)).toBeCloseTo(37 * MODULE_MM_WARN, 5);
		expect(minWidthMmForModule(29, 4, MODULE_MM_GOOD)).toBeCloseTo(18.5, 5);
		// The floor width really does clear the floor.
		expect(moduleMm(minWidthMmForModule(29), 29)).toBeCloseTo(MODULE_MM_WARN, 10);
	});

	it('converts units', () => {
		expect(toMm(1, 'in')).toBeCloseTo(25.4, 10);
		expect(toMm(3, 'cm')).toBe(30);
		expect(toMm(7, 'mm')).toBe(7);
		expect(fromMm(25.4, 'in')).toBeCloseTo(1, 10);
		expect(fromMm(30, 'cm')).toBe(3);
	});

	it('formats widths with one decimal and no trailing zero', () => {
		expect(formatMm(30)).toBe('30');
		expect(formatMm(18.25)).toBe('18.3');
		expect(formatMm(0.5)).toBe('0.5');
	});
});

describe('colour', () => {
	it('parses hex and rgb forms', () => {
		expect(parseColor('#000')).toEqual([0, 0, 0]);
		expect(parseColor('#FFF')).toEqual([255, 255, 255]);
		expect(parseColor('#1a2b3c')).toEqual([26, 43, 60]);
		expect(parseColor('#1a2b3c80')).toEqual([26, 43, 60]);
		expect(parseColor('rgb(12, 34, 56)')).toEqual([12, 34, 56]);
		expect(parseColor('rgba(12,34,56,0.5)')).toEqual([12, 34, 56]);
		expect(parseColor('transparent')).toBeNull();
		expect(parseColor('#12345')).toBeNull();
		expect(parseColor('nonsense')).toBeNull();
	});

	it('computes relative luminance', () => {
		expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 10);
		expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
	});

	it('computes WCAG contrast ratios', () => {
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
		expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
		expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 10);
		// Unparseable colours fall back to 1.
		expect(contrastRatio('transparent', '#ffffff')).toBe(1);
	});

	it('detects inverted codes', () => {
		expect(isInverted('#ffffff', '#000000')).toBe(true);
		expect(isInverted('#000000', '#ffffff')).toBe(false);
		expect(isInverted('#ffffff', 'transparent')).toBe(false);
	});

	it('detects red foregrounds', () => {
		expect(isReddish('#ff0000')).toBe(true);
		expect(isReddish('#e02020')).toBe(true);
		expect(isReddish('#000000')).toBe(false);
		expect(isReddish('#003366')).toBe(false);
		expect(isReddish('#ffffff')).toBe(false);
	});
});

describe('assess', () => {
	it('is clean at a comfortable size', () => {
		const warnings = assess({ widthMm: 30, size: 29 });
		expect(warnings.every((w) => w.level === 'info')).toBe(true);
		expect(find(warnings, 'module-size')).toHaveLength(0);
		const distance = find(warnings, 'scan-distance');
		expect(distance).toHaveLength(1);
		expect(distance[0]!.message).toContain('At 30 mm');
		expect(distance[0]!.message).toContain('0.81 mm');
		expect(distance[0]!.message).toContain('about 0.3 m');
		expect(distance[0]!.message).toContain('Safe.');
	});

	it('warns below the 0.4 mm module floor and names the width that fixes it', () => {
		const warnings = assess({ widthMm: 15, size: 37 });
		const [module] = find(warnings, 'module-size');
		expect(module!.level).toBe('warn');
		// 37 modules + 8 quiet = 45; 15 / 45 = 0.33 mm; 45 * 0.4 = 18 mm.
		expect(module!.message).toContain('At 15 mm');
		expect(module!.message).toContain('0.33 mm');
		expect(module!.message).toContain('0.4 mm floor');
		expect(module!.message).toContain('18 mm or more');
	});

	it('nudges when modules are between the floor and the recommendation', () => {
		// 45 total modules: 20 mm gives 0.44 mm, and 0.5 mm needs 23 mm.
		const warnings = assess({ widthMm: 20, size: 37 });
		const [module] = find(warnings, 'module-size');
		expect(module!.level).toBe('info');
		expect(module!.message).toContain('0.44 mm');
		expect(module!.message).toContain('23 mm or more');
		expect(find(warnings, 'scan-distance')[0]!.message).toContain('Tight.');
	});

	it('warns when the width cannot carry the requested scan distance', () => {
		const warnings = assess({ widthMm: 100, size: 29, scanDistanceM: 2 });
		const distance = find(warnings, 'scan-distance');
		expect(distance.map((w) => w.level).sort()).toEqual(['info', 'warn']);
		const warn = distance.find((w) => w.level === 'warn')!;
		expect(warn.message).toContain('from 2.0 m');
		expect(warn.message).toContain('at least 250 mm wide');
	});

	it('accepts a width that comfortably carries the scan distance', () => {
		const warnings = assess({ widthMm: 300, size: 29, scanDistanceM: 2 });
		expect(find(warnings, 'scan-distance')).toHaveLength(1);
		expect(warnings.every((w) => w.level === 'info')).toBe(true);
	});

	it('warns on a short quiet zone and blocks on none at all', () => {
		const short = find(assess({ widthMm: 30, size: 29, quiet: 2 }), 'quiet-zone');
		expect(short[0]!.level).toBe('warn');
		expect(short[0]!.message).toContain('2 modules');

		const none = find(assess({ widthMm: 30, size: 29, quiet: 0 }), 'quiet-zone');
		expect(none[0]!.level).toBe('block');
	});

	it('warns on low contrast, inversion, and red foregrounds', () => {
		const low = assess({ widthMm: 30, size: 29, fg: '#999999', bg: '#ffffff' });
		const contrast = find(low, 'contrast')[0]!;
		expect(contrast.level).toBe('warn');
		expect(contrast.message).toContain('2.8:1');

		const inverted = assess({ widthMm: 30, size: 29, fg: '#ffffff', bg: '#000000' });
		expect(find(inverted, 'inverted')[0]!.level).toBe('warn');
		expect(find(inverted, 'contrast')).toHaveLength(0);

		const red = assess({ widthMm: 30, size: 29, fg: '#ff0000', bg: '#ffffff' });
		const reddish = find(red, 'red-foreground')[0]!;
		expect(reddish.level).toBe('warn');
		expect(reddish.message).toContain('red light');

		// An unparseable background is not treated as a contrast failure.
		const transparent = assess({ widthMm: 30, size: 29, bg: 'transparent' });
		expect(find(transparent, 'contrast')).toHaveLength(0);
		expect(find(transparent, 'inverted')).toHaveLength(0);
	});

	it('warns then blocks as the logo hides more of the code, and asks for ECC H', () => {
		const ok = assess({ widthMm: 30, size: 29, logoCover: 0.09, ecc: 'H' });
		expect(find(ok, 'logo-size')).toHaveLength(0);
		expect(find(ok, 'logo-ecc')).toHaveLength(0);

		// Exactly at a threshold is still allowed; the rule is "above".
		expect(find(assess({ widthMm: 30, size: 29, logoCover: 0.15, ecc: 'H' }), 'logo-size')).toHaveLength(0);

		const big = assess({ widthMm: 30, size: 29, logoCover: 0.17, ecc: 'H' });
		const bigWarning = find(big, 'logo-size')[0]!;
		expect(bigWarning.level).toBe('warn');
		expect(bigWarning.message).toContain('17%');

		const huge = assess({ widthMm: 30, size: 29, logoCover: 0.24, ecc: 'H' });
		const hugeWarning = find(huge, 'logo-size')[0]!;
		expect(hugeWarning.level).toBe('block');
		expect(hugeWarning.message).toContain('24%');

		const lowEcc = assess({ widthMm: 30, size: 29, logoCover: 0.05, ecc: 'M' });
		expect(find(lowEcc, 'logo-ecc')[0]!.level).toBe('warn');
		expect(find(lowEcc, 'logo-ecc')[0]!.message).toContain('error correction is M');

		// hasLogo alone is enough to ask for H.
		expect(find(assess({ widthMm: 30, size: 29, hasLogo: true }), 'logo-ecc')).toHaveLength(1);
	});

	it('orders blocks before warns before infos', () => {
		const warnings = assess({
			widthMm: 15,
			size: 37,
			quiet: 0,
			fg: '#ff0000',
			bg: '#ffffff',
			logoCover: 0.4,
			ecc: 'L'
		});
		const levels = warnings.map((w) => w.level);
		expect(levels.indexOf('block')).toBe(0);
		expect(levels.lastIndexOf('block')).toBeLessThan(levels.indexOf('warn'));
		expect(levels.lastIndexOf('warn')).toBeLessThan(levels.indexOf('info'));
		expect(warnings.filter((w) => w.level === 'block').map((w) => w.code).sort()).toEqual([
			'logo-size',
			'quiet-zone'
		]);
	});
});

describe('status', () => {
	it('grades a set of warnings', () => {
		expect(statusFor([], 0.81, 21)).toBe('print-safe');
		expect(statusFor([], 0.45, 21)).toBe('scannable');
		expect(statusFor([], 0.81, 2)).toBe('scannable');
		expect(statusFor([{ level: 'info', code: 'x', message: '' }], 0.81, 21)).toBe('print-safe');
		expect(statusFor([{ level: 'warn', code: 'x', message: '' }], 0.81, 21)).toBe('risky');
		expect(statusFor([{ level: 'block', code: 'x', message: '' }], 0.81, 21)).toBe('blocked');
		expect(statusFor([], 0.3, 21)).toBe('risky');
	});

	it('summarises real inputs', () => {
		expect(summary({ widthMm: 30, size: 29 })).toBe('print-safe');
		expect(summary({ widthMm: 20, size: 37 })).toBe('scannable');
		expect(summary({ widthMm: 15, size: 37 })).toBe('risky');
		expect(summary({ widthMm: 30, size: 29, quiet: 0 })).toBe('blocked');
		expect(summary({ widthMm: 30, size: 29, bg: 'transparent' })).toBe('print-safe');
		expect(CONTRAST_MIN).toBe(4);
	});
});

describe('transparent background', () => {
	it('is assessed as white paper', async () => {
		const { assess, summary, paperColor } = await import('../src/sizing.js');
		expect(paperColor('transparent')).toBe('#ffffff');
		const w = assess({ widthMm: 30, size: 25, fg: '#ffffff', bg: 'transparent' });
		expect(w.some((x) => x.code === 'contrast')).toBe(true);
		expect(summary({ widthMm: 30, size: 25, fg: '#ffffff', bg: 'transparent' })).not.toBe('print-safe');
	});
});
