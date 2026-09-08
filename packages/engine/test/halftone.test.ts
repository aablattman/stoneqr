import { describe, expect, it } from 'vitest';
import {
	encode,
	halftoneVersionFor,
	halftoneWithFallback,
	imagePlacement,
	prepareImage,
	renderHalftone,
	sizeForVersion,
	verifyRaster,
	THRESHOLD_DEFAULT,
	THRESHOLD_MAX,
	THRESHOLD_MIN,
	type RasterImage
} from '../src/index.js';

const PAYLOAD = 'https://stoneqr.app/halftone';

/** A mid-grey checker: the worst case for a decoder, because it looks like module structure. */
function checker(side = 256, cell = 8, a = 110, b = 170): RasterImage {
	const data = new Uint8ClampedArray(side * side * 4);
	for (let y = 0; y < side; y++) {
		for (let x = 0; x < side; x++) {
			const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? a : b;
			const p = (y * side + x) * 4;
			data[p] = v;
			data[p + 1] = v;
			data[p + 2] = v;
			data[p + 3] = 255;
		}
	}
	return { width: side, height: side, data };
}

/** A smooth, photo-like gradient with a bright corner and a dark corner. */
function gradient(w = 320, h = 240): RasterImage {
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const p = (y * w + x) * 4;
			data[p] = Math.round((x / (w - 1)) * 235) + 10;
			data[p + 1] = Math.round((y / (h - 1)) * 200) + 30;
			data[p + 2] = Math.round(((x + y) / (w + h - 2)) * 180) + 40;
			data[p + 3] = 255;
		}
	}
	return { width: w, height: h, data };
}

function pixel(img: RasterImage, x: number, y: number): [number, number, number] {
	const p = (y * img.width + x) * 4;
	return [img.data[p] ?? 0, img.data[p + 1] ?? 0, img.data[p + 2] ?? 0];
}

const isBlack = (c: [number, number, number]) => c[0] === 0 && c[1] === 0 && c[2] === 0;
const isWhite = (c: [number, number, number]) => c[0] === 255 && c[1] === 255 && c[2] === 255;

function halftoneQr(payload = PAYLOAD) {
	return encode(payload, { ecc: 'H', minVersion: halftoneVersionFor(payload) });
}

describe('halftoneVersionFor', () => {
	it('picks the smallest version with enough modules for a picture', () => {
		// Default budget is version 7 (45 × 45 = 2025 modules).
		expect(halftoneVersionFor('hi')).toBe(7);
		expect(sizeForVersion(halftoneVersionFor('hi'))).toBe(45);
		expect(halftoneVersionFor('hi', 1000)).toBe(4); // 33 × 33 = 1089
		expect(halftoneVersionFor('hi', 100)).toBe(1);
	});
	it('never lowers what the payload needs at ECC H', () => {
		const long = 'https://example.com/' + 'x'.repeat(400);
		const min = halftoneVersionFor(long);
		const qr = encode(long, { ecc: 'H', minVersion: min });
		expect(qr.version).toBeGreaterThan(min);
		expect(qr.ecc).toBe('H');
	});
});

describe('renderHalftone', () => {
	const qr = halftoneQr();

	it('sizes the output from the module count, quiet zone, and scale', () => {
		const r = renderHalftone(qr, checker(), { pxPerModule: 8, quietZone: 4 });
		const side = (qr.size + 8) * 8;
		expect(r.width).toBe(side);
		expect(r.height).toBe(side);
		expect(r.data.length).toBe(side * side * 4);

		const r3 = renderHalftone(qr, checker(), { pxPerModule: 3, quietZone: 2 });
		expect(r3.width).toBe((qr.size + 4) * 3);
	});

	it('keeps the quiet zone clean', () => {
		const r = renderHalftone(qr, checker(), { pxPerModule: 8, quietZone: 4 });
		expect(isWhite(pixel(r, 0, 0))).toBe(true);
		expect(isWhite(pixel(r, 4 * 8 - 1, 4 * 8 - 1))).toBe(true);
		expect(isWhite(pixel(r, r.width - 1, r.height - 1))).toBe(true);
	});

	it('paints function patterns solid, with no image showing through', () => {
		const px = 8;
		const quiet = 4;
		const r = renderHalftone(qr, checker(), { pxPerModule: px, quietZone: quiet });
		// The whole top-left finder block (7 × 7 plus its separator) is function modules.
		for (let my = 0; my < 8; my++) {
			for (let mx = 0; mx < 8; mx++) {
				expect(qr.functionMask[my]![mx]).toBe(true);
				const expectDark = qr.matrix[my]![mx] === true;
				// Every pixel of the module, corners included, matches the matrix exactly.
				for (const [dx, dy] of [
					[0, 0],
					[px - 1, 0],
					[0, px - 1],
					[px - 1, px - 1],
					[px >> 1, px >> 1]
				] as [number, number][]) {
					const c = pixel(r, (mx + quiet) * px + dx, (my + quiet) * px + dy);
					expect(expectDark ? isBlack(c) : isWhite(c)).toBe(true);
				}
			}
		}
	});

	it('leaves the image visible around a data module dot', () => {
		const px = 8;
		const quiet = 4;
		const r = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, dotScale: 0.4 });
		// Find a data module away from the edges.
		let found = 0;
		for (let my = 10; my < qr.size - 10 && found < 12; my++) {
			for (let mx = 10; mx < qr.size - 10 && found < 12; mx++) {
				if (qr.functionMask[my]![mx] === true) continue;
				found++;
				const x0 = (mx + quiet) * px;
				const y0 = (my + quiet) * px;
				// Corner of the module: the picture, neither pure ink nor pure paper.
				const corner = pixel(r, x0, y0);
				expect(isBlack(corner)).toBe(false);
				expect(isWhite(corner)).toBe(false);
				// Centre of the module: the dot, exactly the matrix colour.
				const centre = pixel(r, x0 + (px >> 1), y0 + (px >> 1));
				expect(qr.matrix[my]![mx] === true ? isBlack(centre) : isWhite(centre)).toBe(true);
			}
		}
		expect(found).toBe(12);
	});

	it('grows the dot with dotScale and clamps it to the allowed range', () => {
		const px = 10;
		const quiet = 4;
		const count = (dotScale: number) => {
			const r = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, dotScale });
			// Measure the dot on the first dark data module by scanning its middle row.
			for (let my = 10; my < qr.size - 10; my++) {
				for (let mx = 10; mx < qr.size - 10; mx++) {
					if (qr.functionMask[my]![mx] === true || qr.matrix[my]![mx] !== true) continue;
					const y = (my + quiet) * px + (px >> 1);
					let n = 0;
					for (let dx = 0; dx < px; dx++) if (isBlack(pixel(r, (mx + quiet) * px + dx, y))) n++;
					return n;
				}
			}
			return -1;
		};
		expect(count(0.3)).toBe(3);
		expect(count(0.6)).toBe(6);
		// Out of range values clamp rather than throw.
		expect(count(0.9)).toBe(7);
		expect(count(0.05)).toBe(3);
	});

	it('fades the image toward the light colour without touching the modules', () => {
		const px = 8;
		const quiet = 4;
		const img = gradient();
		const plain = renderHalftone(qr, img, { pxPerModule: px, quietZone: quiet });
		const dimmed = renderHalftone(qr, img, { pxPerModule: px, quietZone: quiet, imageDim: 0.6 });
		let checked = 0;
		for (let my = 10; my < qr.size - 10 && checked < 5; my++) {
			for (let mx = 10; mx < qr.size - 10 && checked < 5; mx++) {
				if (qr.functionMask[my]![mx] === true) continue;
				checked++;
				const x = (mx + quiet) * px;
				const y = (my + quiet) * px;
				const a = pixel(plain, x, y);
				const b = pixel(dimmed, x, y);
				// Fading moves every channel toward white.
				expect(b[0]).toBeGreaterThanOrEqual(a[0]);
				expect(b[1]).toBeGreaterThanOrEqual(a[1]);
				expect(b[2]).toBeGreaterThanOrEqual(a[2]);
			}
		}
		expect(checked).toBe(5);
	});

	it('grayscale flattens the channels', () => {
		const r = renderHalftone(qr, gradient(), { pxPerModule: 8, quietZone: 4, grayscale: true });
		// Sample a spot in the data area that is not on a dot.
		const c = pixel(r, 4 * 8 + 12 * 8, 4 * 8 + 12 * 8);
		expect(Math.abs(c[0] - c[1])).toBeLessThanOrEqual(1);
		expect(Math.abs(c[1] - c[2])).toBeLessThanOrEqual(1);
	});

	it('accepts an RGB (3 channel) buffer', () => {
		const side = 64;
		const rgb = new Uint8Array(side * side * 3).fill(140);
		const r = renderHalftone(qr, { width: side, height: side, data: rgb }, { pxPerModule: 8 });
		const c = pixel(r, 4 * 8 + 12 * 8, 4 * 8 + 12 * 8);
		expect(isBlack(c)).toBe(false);
		expect(isWhite(c)).toBe(false);
	});
});

describe('silhouette threshold', () => {
	const qr = halftoneQr();
	const px = 8;
	const quiet = 4;

	/** Every pixel that is neither the dark nor the light colour, over the data area only. */
	function midtones(r: RasterImage, dark = [0, 0, 0], light = [255, 255, 255]): number {
		let n = 0;
		const a0 = quiet * px;
		const a1 = (quiet + qr.size) * px;
		for (let y = a0; y < a1; y++) {
			for (let x = a0; x < a1; x++) {
				const c = pixel(r, x, y);
				const isDark = c[0] === dark[0] && c[1] === dark[1] && c[2] === dark[2];
				const isLight = c[0] === light[0] && c[1] === light[1] && c[2] === light[2];
				if (!isDark && !isLight) n++;
			}
		}
		return n;
	}

	it('reduces the picture to the two module colours', () => {
		// A gradient has every grey; a mid-grey checker has two. Both must collapse to ink and paper,
		// leaving only the bilinear edges between the two tones as midtones.
		const total = (qr.size * px) ** 2;
		const softGradient = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet });
		const hardGradient = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, threshold: THRESHOLD_DEFAULT });
		expect(midtones(softGradient)).toBeGreaterThan(total * 0.5);
		expect(midtones(hardGradient)).toBeLessThan(total * 0.05);
		// The checker is nothing but edges, so proportionally more survive; still a fraction of before.
		const softChecker = renderHalftone(qr, checker(), { pxPerModule: px, quietZone: quiet });
		const hardChecker = renderHalftone(qr, checker(), { pxPerModule: px, quietZone: quiet, threshold: THRESHOLD_DEFAULT });
		expect(midtones(hardChecker)).toBeLessThan(midtones(softChecker) * 0.25);
	});

	it('moves the cut with the threshold: a higher cut makes more of the picture dark', () => {
		const darkCount = (threshold: number) => {
			const r = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, threshold });
			let n = 0;
			for (let y = quiet * px; y < (quiet + qr.size) * px; y++)
				for (let x = quiet * px; x < (quiet + qr.size) * px; x++) if (isBlack(pixel(r, x, y))) n++;
			return n;
		};
		const low = darkCount(0.2);
		const mid = darkCount(0.5);
		const high = darkCount(0.8);
		expect(mid).toBeGreaterThan(low);
		expect(high).toBeGreaterThan(mid);
		// A checker of 110 and 170 greys splits either side of the cut.
		const c = checker(256, 8, 110, 170);
		const between = renderHalftone(qr, c, { pxPerModule: px, quietZone: quiet, threshold: 140 / 255 });
		const above = renderHalftone(qr, c, { pxPerModule: px, quietZone: quiet, threshold: 200 / 255 });
		expect(midtones(between)).toBeGreaterThan(0); // cells alternate, so there are edges
		expect(midtones(above)).toBe(0); // everything is darker than the cut: solid ink, no edges
	});

	it('paints the silhouette in the chosen ink and paper colours', () => {
		const dark: [number, number, number] = [20, 40, 80];
		const light: [number, number, number] = [250, 245, 230];
		const r = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, threshold: 0.5, dark, light });
		expect(midtones(r, dark, light)).toBeLessThan((qr.size * px) ** 2 * 0.05);
	});

	it('paints only the shape with `ink`, leaving the dots the code colour', () => {
		// A source that is dark everywhere, so the whole picture falls below the cut and every
		// picture pixel is the shape. The dots are then the only thing that can differ.
		const side = 64;
		const black: RasterImage = { width: side, height: side, data: new Uint8ClampedArray(side * side * 4).fill(0) };
		for (let i = 3; i < side * side * 4; i += 4) black.data[i] = 255;
		const ink: [number, number, number] = [31, 111, 99];
		const r = renderHalftone(qr, black, { pxPerModule: px, quietZone: quiet, threshold: 0.5, ink });

		let checked = 0;
		for (let my = 10; my < qr.size - 10 && checked < 5; my++) {
			for (let mx = 10; mx < qr.size - 10 && checked < 5; mx++) {
				// A dark data module: its dot is painted, and the picture shows around it.
				if (qr.functionMask[my]![mx] === true || qr.matrix[my]![mx] !== true) continue;
				const x = (mx + quiet) * px;
				const y = (my + quiet) * px;
				expect(pixel(r, x, y)).toEqual(ink); // the shape, at the module's corner
				expect(isBlack(pixel(r, x + px / 2, y + px / 2))).toBe(true); // the dot, at its centre
				checked++;
			}
		}
		expect(checked).toBe(5);
		// The quiet zone is the light colour throughout: `ink` never reaches it.
		expect(isWhite(pixel(r, 2, 2))).toBe(true);
	});

	it('defaults `ink` to the code colour, and ignores it without a cut', () => {
		const dark: [number, number, number] = [20, 40, 80];
		const ink: [number, number, number] = [200, 30, 30];
		// No `ink`: the shape is `dark`, as it was before the option existed.
		const plain = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, threshold: 0.5, dark });
		expect(midtones(plain, dark)).toBeLessThan((qr.size * px) ** 2 * 0.05);
		// `ink` with no cut: there is no silhouette to colour, so the raster is untouched.
		const soft = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, dark });
		const softInked = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, dark, ink });
		expect(softInked.data).toEqual(soft.data);
	});

	it('carries `ink` through the fallback ladder, resolved to `dark` when unset', () => {
		const ink: [number, number, number] = [31, 111, 99];
		expect(halftoneWithFallback(qr, gradient(), PAYLOAD, { threshold: 0.5, ink }).opts.ink).toEqual(ink);
		const dark: [number, number, number] = [20, 40, 80];
		expect(halftoneWithFallback(qr, gradient(), PAYLOAD, { threshold: 0.5, dark }).opts.ink).toEqual(dark);
	});

	it('fades a silhouette toward the light colour so the ladder can still soften it', () => {
		const hard = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, threshold: 0.5 });
		const faded = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, threshold: 0.5, imageDim: 0.5 });
		// A dark region of the silhouette becomes mid-grey; the dots stay pure.
		let darkSeen = 0;
		for (let my = 10; my < qr.size - 10 && darkSeen < 5; my++) {
			for (let mx = 10; mx < qr.size - 10 && darkSeen < 5; mx++) {
				if (qr.functionMask[my]![mx] === true) continue;
				const x = (mx + quiet) * px;
				const y = (my + quiet) * px;
				if (!isBlack(pixel(hard, x, y))) continue;
				darkSeen++;
				const c = pixel(faded, x, y);
				expect(c[0]).toBeGreaterThan(100);
				expect(c[0]).toBeLessThan(160);
			}
		}
		expect(darkSeen).toBe(5);
	});

	it('clamps the threshold and treats null like unset', () => {
		const r = halftoneWithFallback(qr, gradient(), PAYLOAD, { threshold: 5 });
		expect(r.opts.threshold).toBe(THRESHOLD_MAX);
		const r2 = halftoneWithFallback(qr, gradient(), PAYLOAD, { threshold: -1 });
		expect(r2.opts.threshold).toBe(THRESHOLD_MIN);
		const r3 = halftoneWithFallback(qr, gradient(), PAYLOAD, { threshold: null as unknown as number });
		expect(r3.opts.threshold).toBeUndefined();
	});

	it('still decodes a hard silhouette at 8 px and 3 px per module', () => {
		for (const scale of [8, 3]) {
			const r = renderHalftone(qr, gradient(), { pxPerModule: scale, quietZone: 4, threshold: 0.5 });
			expect(verifyRaster(r, PAYLOAD)).toEqual({ ok: true, decoded: PAYLOAD });
		}
		// A pure black-and-white glyph made of big shapes: the case this feature exists for.
		const glyph = disc(400);
		expect(verifyRaster(renderHalftone(qr, glyph, { pxPerModule: 8, threshold: 0.5 }), PAYLOAD).ok).toBe(true);
	});

	it('prepareImage matches what the renderer blends', () => {
		const img = gradient();
		const prepared = prepareImage(img, { threshold: 0.5, dark: [1, 2, 3], light: [250, 251, 252] });
		expect(prepared.width).toBe(img.width);
		expect(prepared.height).toBe(img.height);
		expect(prepared.data.length).toBe(img.width * img.height * 4);
		let darks = 0;
		let lights = 0;
		for (let i = 0; i < img.width * img.height; i++) {
			const p = i * 4;
			const c = [prepared.data[p], prepared.data[p + 1], prepared.data[p + 2]];
			expect(prepared.data[p + 3]).toBe(255);
			if (c[0] === 1 && c[1] === 2 && c[2] === 3) darks++;
			else if (c[0] === 250 && c[1] === 251 && c[2] === 252) lights++;
			else throw new Error(`unexpected colour ${c.join(',')} at ${i}`);
		}
		expect(darks).toBeGreaterThan(0);
		expect(lights).toBeGreaterThan(0);
		// Without a threshold it is the plain picture, alpha composited: a solid RGBA source is unchanged.
		const same = prepareImage(img);
		expect(Array.from(same.data.slice(0, 8))).toEqual(Array.from(img.data.slice(0, 8)));
		// A transparent pixel composites over the light colour before the cut.
		const clear: RasterImage = { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 0, 0]) };
		expect(Array.from(prepareImage(clear, { threshold: 0.5 }).data)).toEqual([255, 255, 255, 255]);
	});
});

describe('imagePlacement', () => {
	it('cover-fits by default and grows from the centre with zoom', () => {
		// Landscape picture into a 100-unit square: height-limited, width overflows.
		const p1 = imagePlacement(320, 240, 100);
		expect(p1.height).toBeCloseTo(100);
		expect(p1.width).toBeCloseTo(400 / 3);
		expect(p1.y).toBeCloseTo(0);
		expect(p1.x).toBeCloseTo((100 - 400 / 3) / 2);
		const p2 = imagePlacement(320, 240, 100, { imageZoom: 2 });
		expect(p2.width).toBeCloseTo(p1.width * 2);
		expect(p2.x + p2.width / 2).toBeCloseTo(50); // still centred
	});
	it('shifts by a fraction of the area and clamps every input', () => {
		const p = imagePlacement(100, 100, 100, { imageOffsetX: 0.25, imageOffsetY: -0.25 });
		expect(p.x).toBeCloseTo(25);
		expect(p.y).toBeCloseTo(-25);
		const c = imagePlacement(100, 100, 100, { imageZoom: 10, imageOffsetX: 5, imageOffsetY: -5 });
		expect(c.width).toBeCloseTo(300);
		expect(c.x).toBeCloseTo((100 - 300) / 2 + 50);
		expect(c.y).toBeCloseTo((100 - 300) / 2 - 50);
	});
	it('returns an empty box for a picture with no pixels', () => {
		expect(imagePlacement(0, 10, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
	});
});

describe('renderHalftone zoom and position', () => {
	const qr = halftoneQr();
	const px = 8;
	const quiet = 4;
	/** Top-left pixel of the first data module in column 0: picture, not dot, not function pattern. */
	function leftEdge(r: RasterImage): [number, number, number] {
		for (let my = 9; my < qr.size - 9; my++) {
			if (qr.functionMask[my]![0] === true) continue;
			return pixel(r, quiet * px, (my + quiet) * px);
		}
		throw new Error('no data module in column 0');
	}
	function rightEdge(r: RasterImage): [number, number, number] {
		for (let my = 9; my < qr.size - 9; my++) {
			if (qr.functionMask[my]![qr.size - 1] === true) continue;
			return pixel(r, (qr.size + quiet) * px - 1, (my + quiet) * px);
		}
		throw new Error('no data module in the last column');
	}

	it('zooming in samples nearer the middle of the picture', () => {
		// The gradient's red channel rises left to right, so the left edge gets redder as we zoom.
		const z1 = leftEdge(renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet }));
		const z2 = leftEdge(renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, imageZoom: 2 }));
		expect(z2[0]).toBeGreaterThan(z1[0] + 20);
	});

	it('zooming out leaves the light colour around the picture', () => {
		const full = renderHalftone(qr, checker(), { pxPerModule: px, quietZone: quiet });
		const small = renderHalftone(qr, checker(), { pxPerModule: px, quietZone: quiet, imageZoom: 0.5 });
		expect(isWhite(leftEdge(full))).toBe(false);
		expect(isWhite(leftEdge(small))).toBe(true);
		// The middle of the data area still shows the picture.
		const mid = (quiet + qr.size / 2) * px;
		expect(isWhite(pixel(small, Math.floor(mid) + 1, Math.floor(mid) + 1))).toBe(false);
	});

	it('shifting the picture uncovers the side it moved away from', () => {
		const shifted = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet, imageOffsetX: 0.3 });
		expect(isWhite(leftEdge(shifted))).toBe(true);
		expect(isWhite(rightEdge(shifted))).toBe(false);
		const centred = renderHalftone(qr, gradient(), { pxPerModule: px, quietZone: quiet });
		expect(isWhite(leftEdge(centred))).toBe(false);
		expect(isWhite(rightEdge(centred))).toBe(false);
	});

	it('still decodes when zoomed and shifted, and the ladder keeps the crop', () => {
		const r = halftoneWithFallback(qr, gradient(), PAYLOAD, { imageZoom: 2.5, imageOffsetX: -0.2, imageOffsetY: 0.1 });
		expect(r.ok).toBe(true);
		expect(r.opts.imageZoom).toBe(2.5);
		expect(r.opts.imageOffsetX).toBe(-0.2);
		expect(r.opts.imageOffsetY).toBe(0.1);
	});

	it('clamps zoom and offsets in the resolved options', () => {
		const r = halftoneWithFallback(qr, gradient(), PAYLOAD, { imageZoom: 10, imageOffsetX: 5, imageOffsetY: -5 });
		expect(r.opts.imageZoom).toBe(3);
		expect(r.opts.imageOffsetX).toBe(0.5);
		expect(r.opts.imageOffsetY).toBe(-0.5);
	});
});

describe('halftone decode (plan §12: 8 px and 3 px per module)', () => {
	const images: [string, RasterImage][] = [
		['mid-grey checker', checker()],
		['photo-like gradient', gradient()]
	];
	for (const [label, img] of images) {
		it(`decodes ${label} at 8 px per module`, () => {
			const qr = halftoneQr();
			const r = renderHalftone(qr, img, { pxPerModule: 8, quietZone: 4 });
			expect(verifyRaster(r, PAYLOAD)).toEqual({ ok: true, decoded: PAYLOAD });
		});
		it(`decodes ${label} at 3 px per module`, () => {
			const qr = halftoneQr();
			const r = renderHalftone(qr, img, { pxPerModule: 3, quietZone: 4 });
			expect(verifyRaster(r, PAYLOAD)).toEqual({ ok: true, decoded: PAYLOAD });
		});
	}
});

describe('halftoneWithFallback', () => {
	it('takes the first attempt when the defaults already decode', () => {
		const qr = halftoneQr();
		const r = halftoneWithFallback(qr, gradient(), PAYLOAD);
		expect(r.ok).toBe(true);
		expect(r.attempts).toHaveLength(1);
		expect(r.attempts[0]).toContain('decoded');
		expect(r.note).toBe('');
		expect(r.opts.dotScale).toBe(0.4);
		expect(verifyRaster(r.raster, PAYLOAD).ok).toBe(true);
	});

	it('climbs the ladder and reports what it changed', () => {
		const qr = halftoneQr();
		// Pure black-and-white noise at module scale is the hardest case; if the defaults survive
		// it, the ladder is never exercised, so only assert the contract that always holds.
		const noise = noiseImage(qr.size * 3);
		const r = halftoneWithFallback(qr, noise, PAYLOAD, { dotScale: 0.25 });
		expect(r.attempts.length).toBeGreaterThanOrEqual(1);
		expect(r.attempts.length).toBeLessThanOrEqual(5);
		if (r.attempts.length > 1) {
			expect(r.note).not.toBe('');
			expect(r.opts.dotScale ?? 0).toBeGreaterThan(0.25);
		}
		if (r.ok) expect(verifyRaster(r.raster, PAYLOAD).ok).toBe(true);
		// Either way a raster comes back so the preview has something to show.
		expect(r.raster.width).toBe((qr.size + 8) * 8);
	});

	it('runs the whole ladder and reports failure rather than throwing', () => {
		const qr = halftoneQr();
		// A payload the symbol cannot possibly carry forces every rung to fail.
		const r = halftoneWithFallback(qr, gradient(), 'never-matches', { dotScale: 0.3, imageDim: 0.1 });
		expect(r.ok).toBe(false);
		expect(r.attempts).toHaveLength(5);
		expect(r.attempts.every((a) => a.endsWith('did not decode'))).toBe(true);
		expect(r.attempts[0]).toContain('dots 0.3');
		expect(r.attempts[1]).toContain('larger dots (0.5)');
		expect(r.attempts[2]).toContain('30%');
		expect(r.note).toMatch(/too busy/);
		// The last attempt still comes back so the preview has something to show.
		expect(r.opts.dotScale).toBe(0.6);
		expect(r.opts.imageDim).toBe(0.4);
		expect(r.raster.width).toBe((qr.size + 8) * 8);
	});

	it('honours the caller pxPerModule and quiet zone throughout the ladder', () => {
		const qr = halftoneQr();
		const r = halftoneWithFallback(qr, checker(), PAYLOAD, { pxPerModule: 6, quietZone: 2 });
		expect(r.raster.width).toBe((qr.size + 4) * 6);
	});
});

/** A black disc on white: a hard-edged glyph, the shape the silhouette mode exists for. */
function disc(side: number): RasterImage {
	const data = new Uint8ClampedArray(side * side * 4).fill(255);
	const c = side / 2;
	for (let y = 0; y < side; y++) {
		for (let x = 0; x < side; x++) {
			if (Math.hypot(x - c, y - c) <= side * 0.3) {
				const p = (y * side + x) * 4;
				data[p] = data[p + 1] = data[p + 2] = 0;
			}
		}
	}
	return { width: side, height: side, data };
}

/** Deterministic black/white noise at a fixed block size: the nastiest background there is. */
function noiseImage(side: number): RasterImage {
	const data = new Uint8ClampedArray(side * side * 4);
	let s = 1234567;
	for (let i = 0; i < side * side; i++) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		const v = s % 2 === 0 ? 0 : 255;
		const p = i * 4;
		data[p] = v;
		data[p + 1] = v;
		data[p + 2] = v;
		data[p + 3] = 255;
	}
	return { width: side, height: side, data };
}
