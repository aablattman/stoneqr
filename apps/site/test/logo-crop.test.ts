import { describe, it, expect } from 'vitest';
import {
	FULL_CROP,
	CROP_MIN,
	LOGO_ZOOM_MAX,
	normaliseCrop,
	isFullCrop,
	moveCrop,
	resizeCrop,
	cropZoom,
	zoomCrop,
	cropAspect,
	freeCropModel
} from '../src/lib/logo-crop';
import type { CropRect } from '../src/lib/crop';

describe('normaliseCrop', () => {
	it('is the whole picture for nothing, nonsense, or a missing field', () => {
		expect(normaliseCrop(undefined)).toEqual(FULL_CROP);
		expect(normaliseCrop({ u: NaN, v: 0, w: 1, h: 1 })).toEqual(FULL_CROP);
		expect(normaliseCrop({ u: 0, v: 0, w: Infinity, h: 1 })).toEqual(FULL_CROP);
		expect(normaliseCrop({ w: 0.5 })).toEqual({ u: 0, v: 0, w: 0.5, h: 1 });
	});

	it('keeps the box inside the picture and no smaller than the minimum', () => {
		expect(normaliseCrop({ u: 0.9, v: 0.9, w: 0.5, h: 0.5 })).toEqual({ u: 0.5, v: 0.5, w: 0.5, h: 0.5 });
		expect(normaliseCrop({ u: -1, v: -1, w: 0.5, h: 0.5 })).toEqual({ u: 0, v: 0, w: 0.5, h: 0.5 });
		expect(normaliseCrop({ u: 0, v: 0, w: 0, h: 0 })).toEqual({ u: 0, v: 0, w: CROP_MIN, h: CROP_MIN });
		expect(normaliseCrop({ u: 0, v: 0, w: 3, h: 3 })).toEqual(FULL_CROP);
	});

	it('rounds to a ten-thousandth so share links stay short', () => {
		expect(normaliseCrop({ u: 0.123456789, v: 0, w: 0.5, h: 0.5 }).u).toBe(0.1235);
	});

	it('knows the whole picture when it sees it', () => {
		expect(isFullCrop(FULL_CROP)).toBe(true);
		expect(isFullCrop({ u: 0, v: 0, w: 0.9999999, h: 1 })).toBe(true);
		expect(isFullCrop({ u: 0.01, v: 0, w: 0.99, h: 1 })).toBe(false);
	});
});

describe('moveCrop', () => {
	const box: CropRect = { u: 0.25, v: 0.25, w: 0.5, h: 0.5 };
	it('moves the box and stops it at the edges', () => {
		expect(moveCrop(box, 0.1, 0.4)).toEqual({ u: 0.1, v: 0.4, w: 0.5, h: 0.5 });
		expect(moveCrop(box, 0.8, -0.3)).toEqual({ u: 0.5, v: 0, w: 0.5, h: 0.5 });
	});
});

describe('resizeCrop', () => {
	const box: CropRect = { u: 0.1, v: 0.1, w: 0.4, h: 0.2 };

	it('follows the pointer in both axes, the top-left corner staying put', () => {
		expect(resizeCrop(box, 0.1, 0.1, 0.5, 0.5, 'w', false)).toEqual({ u: 0.1, v: 0.1, w: 0.5, h: 0.5 });
	});

	it('keeps the shape from the axis the pointer moved more along', () => {
		// Shape 1:2 (h over w). Width asked 0.6: height follows to 0.3.
		expect(resizeCrop(box, 0.1, 0.1, 0.6, 0.9, 'w', true)).toEqual({ u: 0.1, v: 0.1, w: 0.6, h: 0.3 });
		// Height asked 0.4: width follows to 0.8.
		expect(resizeCrop(box, 0.1, 0.1, 0.9, 0.4, 'h', true)).toEqual({ u: 0.1, v: 0.1, w: 0.8, h: 0.4 });
	});

	it('stops at the picture\'s edge, shape intact when the shape is kept', () => {
		// Width 2 would run off the right; the most that fits is 0.9, and the height follows.
		expect(resizeCrop(box, 0.1, 0.1, 2, 2, 'w', true)).toEqual({ u: 0.1, v: 0.1, w: 0.9, h: 0.45 });
		// Free: each side is clamped on its own.
		expect(resizeCrop(box, 0.1, 0.1, 2, 2, 'w', false)).toEqual({ u: 0.1, v: 0.1, w: 0.9, h: 0.9 });
	});

	it('never goes below the minimum side', () => {
		expect(resizeCrop(box, 0.1, 0.1, 0.01, -1, 'w', false)).toEqual({ u: 0.1, v: 0.1, w: CROP_MIN, h: CROP_MIN });
	});
});

describe('zoomCrop', () => {
	it('reads 1 for the whole picture and 1 over the longer side otherwise', () => {
		expect(cropZoom(FULL_CROP)).toBe(1);
		expect(cropZoom({ u: 0, v: 0, w: 0.5, h: 0.25 })).toBe(2);
		expect(cropZoom({ u: 0, v: 0, w: 0.25, h: 0.5 })).toBe(2);
	});

	it('scales about the centre, keeping the shape', () => {
		const box: CropRect = { u: 0.25, v: 0.25, w: 0.5, h: 0.25 };
		const out = zoomCrop(box, 4);
		expect(out).toEqual({ u: 0.375, v: 0.3125, w: 0.25, h: 0.125 });
		expect(cropZoom(out)).toBe(4);
	});

	it('stops at the whole picture, and at the ceiling', () => {
		expect(zoomCrop({ u: 0.4, v: 0.4, w: 0.2, h: 0.2 }, 0.5)).toEqual(FULL_CROP);
		expect(cropZoom(zoomCrop(FULL_CROP, 100))).toBe(LOGO_ZOOM_MAX);
	});

	it('shifts a box that would leave the picture back inside', () => {
		const out = zoomCrop({ u: 0.9, v: 0.9, w: 0.1, h: 0.1 }, 1);
		expect(out).toEqual(FULL_CROP);
	});
});

describe('cropAspect', () => {
	it('is the cropped picture\'s height over width', () => {
		// A 4:1 wordmark cropped to its left quarter is square.
		expect(cropAspect({ u: 0, v: 0, w: 0.25, h: 1 }, 0.25)).toBe(1);
		expect(cropAspect(FULL_CROP, 0.25)).toBe(0.25);
		expect(cropAspect({ u: 0, v: 0, w: 1, h: 0.5 }, 1)).toBe(0.5);
	});
	it('assumes a square for a picture with no measurable shape', () => {
		expect(cropAspect({ u: 0, v: 0, w: 0.5, h: 1 }, 0)).toBe(1);
		expect(cropAspect({ u: 0, v: 0, w: 0.5, h: 1 }, NaN)).toBe(1);
	});
});

describe('freeCropModel', () => {
	it('reads the box back from its fields and writes every gesture through them', () => {
		let crop: CropRect = { ...FULL_CROP };
		const model = freeCropModel(
			() => crop,
			(c) => (crop = c)
		);
		expect(model.rect(1)).toEqual(FULL_CROP);
		model.resizeTo(1, 0, 0, 0.5, 0.5, 'w', false);
		expect(crop).toEqual({ u: 0, v: 0, w: 0.5, h: 0.5 });
		model.moveTo(1, 0.3, 0.3);
		expect(crop).toEqual({ u: 0.3, v: 0.3, w: 0.5, h: 0.5 });
		model.zoomStep(1, 1);
		expect(cropZoom(crop)).toBeCloseTo(2.2, 3);
		model.zoomStep(1, -1);
		expect(cropZoom(crop)).toBeCloseTo(2, 3);
	});
});
