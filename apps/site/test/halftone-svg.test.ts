import { describe, expect, it } from 'vitest';
import { encode, halftoneVersionFor, prepareImage, type RasterImage } from '@stoneqr/engine';
import { halftoneToSvg, imageFilter, SVG_THRESHOLD_SLOPE } from '$lib/halftone';
import { GLYPHS, glyphDataUrl, glyphSvg } from '$lib/glyphs';

/**
 * The two-layer SVG export re-applies the picture adjustments as filters on the original image,
 * so the vector file has to say the same thing the raster preview verified. These pin the
 * filter chain for each tone, silhouette included, which has no golden of its own.
 */
const PAYLOAD = 'https://stoneqr.app/photo';
const qr = encode(PAYLOAD, { ecc: 'H', minVersion: halftoneVersionFor(PAYLOAD) });
const pixel = 'data:image/png;base64,iVBORw0KGgo=';

/** The first entry of each channel's two-entry table: the colour the shape is painted. */
function inkEnd(defs: string): number[] {
	return ['R', 'G', 'B'].map((c) => {
		const m = defs.match(new RegExp(`<feFunc${c} type="table" tableValues="([-\\d.]+) `));
		if (!m) throw new Error(`no ${c} table in ${defs}`);
		return Number(m[1]);
	});
}

describe('imageFilter', () => {
	it('is absent for an untouched colour picture', () => {
		expect(imageFilter({})).toEqual({ defs: '', attr: '' });
		expect(imageFilter({ threshold: undefined })).toEqual({ defs: '', attr: '' });
	});

	it('keeps the linear contrast and fade chain for a continuous picture', () => {
		const f = imageFilter({ grayscale: true, contrast: 1.2, imageDim: 0.25 });
		expect(f.defs).toContain('type="saturate" values="0"');
		expect(f.defs).toContain(`slope="${Number((1.2 * 0.75).toFixed(4))}"`);
		expect(f.defs).not.toContain('type="table"');
	});

	it('builds a greyscale, cut, and colour table for a silhouette', () => {
		const f = imageFilter({ threshold: 0.4, dark: [0, 0, 0], light: [255, 255, 255] });
		expect(f.attr).toBe(' filter="url(#sq-halftone-adjust)"');
		// Always through grey first, even when grayscale was not asked for.
		expect(f.defs).toContain('type="saturate" values="0"');
		// The ramp crosses 0.5 exactly at the cut.
		expect(f.defs).toContain(`slope="${SVG_THRESHOLD_SLOPE}" intercept="${Number((0.5 - SVG_THRESHOLD_SLOPE * 0.4).toFixed(4))}"`);
		// 0 maps to ink, 1 to paper.
		expect(f.defs).toContain('<feFuncR type="table" tableValues="0 1"/>');
		// No contrast stage when contrast is 1.
		expect(f.defs.match(/<feComponentTransfer>/g)).toHaveLength(2);
	});

	it('paints a silhouette in the chosen colours and folds the fade into the ink end', () => {
		const f = imageFilter({ threshold: 0.5, imageDim: 0.5, dark: [0, 0, 255], light: [255, 255, 255], contrast: 1.5 });
		// Ink is blue faded halfway to white: (0 + 255 * 0.5) / 255 = 0.5 for red and green, 1 for blue.
		expect(f.defs).toContain('<feFuncR type="table" tableValues="0.5 1"/>');
		expect(f.defs).toContain('<feFuncB type="table" tableValues="1 1"/>');
		// Contrast stage present, before the cut.
		expect(f.defs.match(/<feComponentTransfer>/g)).toHaveLength(3);
		expect(f.defs.indexOf('slope="1.5"')).toBeLessThan(f.defs.indexOf(`slope="${SVG_THRESHOLD_SLOPE}"`));
	});

	it('takes the shape colour from `ink`, and falls back to `dark` as the engine does', () => {
		const ink: [number, number, number] = [31, 111, 99];
		const f = imageFilter({ threshold: 0.5, dark: [0, 0, 0], light: [255, 255, 255], ink });
		expect(inkEnd(f.defs)).toEqual(ink.map((c) => Number((c / 255).toFixed(4))));
		// No `ink`: the table stays on `dark`, the behaviour before the option existed.
		expect(inkEnd(imageFilter({ threshold: 0.5, dark: [0, 0, 255], light: [255, 255, 255] }).defs)).toEqual([0, 0, 1]);
	});

	it('puts the same colour in the shape as the engine does', () => {
		// The filter is the SVG's copy of what `prepareSource` does at the cut, so the two are
		// pinned against each other rather than against numbers typed here. A source that is dark
		// everywhere falls entirely below the cut, so every prepared pixel is the shape.
		const side = 4;
		const data = new Uint8ClampedArray(side * side * 4);
		for (let i = 3; i < data.length; i += 4) data[i] = 255;
		const src: RasterImage = { width: side, height: side, data };
		for (const ink of [[31, 111, 99], [168, 85, 27], [255, 255, 255]] as [number, number, number][]) {
			const opts = { threshold: 0.5, dark: [0, 0, 0] as [number, number, number], light: [255, 255, 255] as [number, number, number], ink };
			const painted = prepareImage(src, opts);
			const engine = [painted.data[0], painted.data[1], painted.data[2]];
			expect(inkEnd(imageFilter(opts).defs).map((v) => Math.round(v * 255))).toEqual(engine);
		}
	});

	it('clamps the cut to the engine range', () => {
		expect(imageFilter({ threshold: 5 }).defs).toContain(`intercept="${Number((0.5 - SVG_THRESHOLD_SLOPE * 0.95).toFixed(4))}"`);
	});
});

describe('halftoneToSvg', () => {
	it('attaches the silhouette filter to the image layer only', () => {
		const svg = halftoneToSvg(qr, { width: 100, height: 100 }, pixel, { threshold: 0.5, quietZone: 4 }, 50);
		expect(svg).toContain('width="50mm"');
		expect(svg.match(/filter="url\(#sq-halftone-adjust\)"/g)).toHaveLength(1);
		expect(svg).toMatch(/<image [^>]*filter="url\(#sq-halftone-adjust\)"/);
		expect(svg.match(/<path /g)).toHaveLength(2);
	});
});

describe('glyphs', () => {
	it('are square, white-backed SVG documents with a stable id each', () => {
		const ids = new Set(GLYPHS.map((g) => g.id));
		expect(ids.size).toBe(GLYPHS.length);
		for (const g of GLYPHS) {
			const svg = glyphSvg(g);
			expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">')).toBe(true);
			expect(svg).toContain('<rect width="100" height="100" fill="#fff"/>');
			expect(svg.endsWith('</svg>')).toBe(true);
			expect(glyphDataUrl(g).startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
		}
	});
});
