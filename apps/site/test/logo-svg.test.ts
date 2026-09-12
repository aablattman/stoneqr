import { describe, it, expect } from 'vitest';
import {
	lengthToPx,
	viewBoxFrom,
	parseViewBox,
	isLocalRef,
	sanitiseCssUrls,
	prefixCssRefs,
	toDataUrl,
	cropSvgMarkup,
	cropSvgDataUrl,
	decodeSvgDataUrl
} from '../src/lib/logo-svg';

/**
 * The string half of the SVG logo preparation. The DOM half needs a parser, the selector engine
 * and layout, so it is checked in a real browser by `bun run logo-fixtures` against the files in
 * `test/fixtures/logos/`.
 */

describe('lengthToPx', () => {
	it('reads the absolute units a drawing program emits', () => {
		expect(lengthToPx('100')).toBe(100);
		expect(lengthToPx('100px')).toBe(100);
		expect(lengthToPx(' 24.5 px ')).toBe(24.5);
		expect(lengthToPx('72pt')).toBeCloseTo(96, 6);
		expect(lengthToPx('1in')).toBe(96);
		expect(lengthToPx('25.4mm')).toBeCloseTo(96, 6);
		expect(lengthToPx('2.54cm')).toBeCloseTo(96, 6);
		expect(lengthToPx('1pc')).toBe(16);
		expect(lengthToPx('4Q')).toBeCloseTo(96 / 25.4, 6);
	});

	it('refuses anything it cannot resolve on its own', () => {
		// A percentage needs a viewport, em needs a font: neither exists for a file on disk.
		expect(lengthToPx('50%')).toBeNull();
		expect(lengthToPx('3em')).toBeNull();
		expect(lengthToPx('10vw')).toBeNull();
		expect(lengthToPx('auto')).toBeNull();
		expect(lengthToPx('')).toBeNull();
		expect(lengthToPx(null)).toBeNull();
		expect(lengthToPx('0')).toBeNull();
		expect(lengthToPx('-5')).toBeNull();
		expect(lengthToPx('12 34')).toBeNull();
	});
});

describe('viewBoxFrom', () => {
	it('converts a physical size into user units, not raw numbers', () => {
		// 10 mm is 37.795 px, and without a viewBox user units run 1:1 with px.
		expect(viewBoxFrom('10mm', '5mm')).toBe('0 0 37.795 18.898');
		expect(viewBoxFrom('120', '40')).toBe('0 0 120 40');
	});

	it('gives nothing when either side is missing or relative', () => {
		expect(viewBoxFrom('100', null)).toBeNull();
		expect(viewBoxFrom(null, '100')).toBeNull();
		expect(viewBoxFrom('100%', '100%')).toBeNull();
	});
});

describe('parseViewBox', () => {
	it('takes the four numbers, comma or space separated', () => {
		expect(parseViewBox('0 0 100 50')).toEqual([0, 0, 100, 50]);
		expect(parseViewBox('0,0,100,50')).toEqual([0, 0, 100, 50]);
		expect(parseViewBox(' -10  -10  20  20 ')).toEqual([-10, -10, 20, 20]);
	});

	it('rejects a box with no area or the wrong shape', () => {
		expect(parseViewBox('0 0 100')).toBeNull();
		expect(parseViewBox('0 0 100 0')).toBeNull();
		expect(parseViewBox('0 0 -5 5')).toBeNull();
		expect(parseViewBox('a b c d')).toBeNull();
		expect(parseViewBox(null)).toBeNull();
	});
});

describe('isLocalRef', () => {
	it('keeps references inside the file', () => {
		expect(isLocalRef('#grad')).toBe(true);
		expect(isLocalRef('  #clip0_1_2  ')).toBe(true);
		expect(isLocalRef('data:image/png;base64,AAAA')).toBe(true);
	});

	it('refuses anything that would be fetched when the export is opened', () => {
		expect(isLocalRef('https://example.com/x.png')).toBe(false);
		expect(isLocalRef('//example.com/x.png')).toBe(false);
		expect(isLocalRef('/logo.png')).toBe(false);
		expect(isLocalRef('../logo.png')).toBe(false);
		expect(isLocalRef('javascript:alert(1)')).toBe(false);
		// A data URL that is not a picture: script can hide in an SVG or an HTML one.
		expect(isLocalRef('data:text/html;base64,AAAA')).toBe(false);
		expect(isLocalRef('data:image/svg+xml;base64,AAAA')).toBe(false);
		expect(isLocalRef('')).toBe(false);
		expect(isLocalRef(null)).toBe(false);
	});
});

describe('sanitiseCssUrls', () => {
	it('leaves a reference to something in the same file', () => {
		expect(sanitiseCssUrls('fill:url(#grad)')).toBe('fill:url(#grad)');
		expect(sanitiseCssUrls("fill: url('#grad')")).toBe("fill: url('#grad')");
		expect(sanitiseCssUrls('fill:url(data:image/png;base64,AA)')).toBe('fill:url(data:image/png;base64,AA)');
	});

	it('removes one that reaches off the machine', () => {
		expect(sanitiseCssUrls('fill:url(https://evil.example/track.png)')).toBe('fill:none');
		expect(sanitiseCssUrls('background:url("//evil.example/x")')).toBe('background:none');
		expect(sanitiseCssUrls('filter:url(other.svg#f)')).toBe('filter:none');
	});

	it('handles several in one declaration list', () => {
		expect(sanitiseCssUrls('fill:url(#a);stroke:url(https://e/x)')).toBe('fill:url(#a);stroke:none');
	});
});

describe('prefixCssRefs', () => {
	it('renames a local reference and nothing else', () => {
		expect(prefixCssRefs('fill:url(#grad)')).toBe('fill:url(#lg-grad)');
		expect(prefixCssRefs("clip-path:url('#clip0')")).toBe('clip-path:url(#lg-clip0)');
		expect(prefixCssRefs('fill:url(data:image/png;base64,AA)')).toBe('fill:url(data:image/png;base64,AA)');
		expect(prefixCssRefs('fill:#ff0000')).toBe('fill:#ff0000');
	});
});

describe('toDataUrl', () => {
	it('makes the base64 form, which is the one the renderer inlines as vector', () => {
		const url = toDataUrl('<svg xmlns="http://www.w3.org/2000/svg"/>');
		expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
		expect(atob(url.slice('data:image/svg+xml;base64,'.length))).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
	});

	it('survives characters outside Latin-1', () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>café ☕ 日本</title></svg>';
		const url = toDataUrl(svg);
		const bytes = Uint8Array.from(atob(url.split(',')[1]!), (c) => c.charCodeAt(0));
		expect(new TextDecoder().decode(bytes)).toBe(svg);
	});
});

describe('cropSvgMarkup', () => {
	const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" width="400" height="100"><rect width="400" height="100" fill="#123"/></svg>';

	it('wraps the drawing in a viewBox that is the crop, in the drawing\'s own units, and clips to it', () => {
		const out = cropSvgMarkup(logo, { u: 0.1, v: 0.2, w: 0.25, h: 0.5 });
		expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="40 20 100 50" width="100" height="50">')).toBe(true);
		expect(out).toContain('<clipPath id="lgcrop"><rect x="40" y="20" width="100" height="50"/></clipPath>');
		expect(out).toContain('<g clip-path="url(#lgcrop)">');
		// The original root is nested whole, sized to its own viewBox so the crop is a plain scaling of it.
		expect(out).toContain('<svg width="400" height="100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><rect');
		expect(out.endsWith('</svg></g></svg>')).toBe(true);
	});

	it('reports the crop\'s shape as its intrinsic size, which is what the hole is cut for', () => {
		const out = cropSvgMarkup(logo, { u: 0, v: 0, w: 0.25, h: 1 });
		expect(out).toContain('viewBox="0 0 100 100" width="100" height="100"');
	});

	it('sizes a root with width and height but no viewBox from those', () => {
		const out = cropSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="5mm"><rect/></svg>', { u: 0.5, v: 0, w: 0.5, h: 1 });
		// 10 mm is 37.795 px.
		expect(out).toMatch(/^<svg [^>]*viewBox="18\.898 0 18\.898 18\.898"/);
		expect(out).toContain('<svg width="37.795" height="18.898" xmlns=');
	});

	it('leaves a drawing with no usable size alone rather than guessing', () => {
		const bare = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
		expect(cropSvgMarkup(bare, { u: 0.1, v: 0.1, w: 0.5, h: 0.5 })).toBe(bare);
		expect(cropSvgMarkup('not svg', { u: 0, v: 0, w: 1, h: 1 })).toBe('not svg');
	});

	it('round-trips through a base64 data URL, the only form the renderer inlines', () => {
		const url = cropSvgDataUrl(toDataUrl(logo), { u: 0, v: 0, w: 0.5, h: 0.5 });
		expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
		expect(decodeSvgDataUrl(url)).toContain('viewBox="0 0 200 50"');
	});
});
