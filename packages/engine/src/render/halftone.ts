/**
 * Halftone ("artistic") rendering: plan §7.
 *
 * Function patterns (finders, separators, timing, alignment, format/version info, dark module)
 * stay solid so the decoder can always find and calibrate the symbol. Every other module is
 * drawn as a small centred dot, leaving the picture visible in the gaps.
 *
 * DOM-free on purpose: it works on plain RGBA buffers so it runs in Node, in tests, and in a
 * Web Worker. The browser glue (canvas decode of the upload, PNG blob, SVG) lives in the site.
 */
import type { EncodedQr, RasterImage } from '../types.js';
import { verifyRaster } from '../verify.js';

export interface HalftoneOptions {
	/** Pixels per module. Default 8 (the verification scale from plan §7 step 5). */
	pxPerModule?: number;
	/** Quiet zone in modules. Default 4. */
	quietZone?: number;
	/** Dot side as a fraction of the module, 0.25..0.7. Default 0.4. */
	dotScale?: number;
	/** RGB 0..255 for dark modules. Default black. */
	dark?: [number, number, number];
	/** RGB 0..255 for light modules and the quiet zone. Default white. */
	light?: [number, number, number];
	/**
	 * RGB 0..255 a silhouette's dark pixels become. Defaults to `dark`, so a silhouette is the
	 * code's own colour unless asked otherwise. Read only where the cut is applied, never by the
	 * dots or the function patterns, so colouring the shape never touches what a scanner reads.
	 * Ignored when `threshold` is unset, because there is no silhouette to colour.
	 */
	ink?: [number, number, number];
	/** 0..1: how far to fade the image toward the light colour. Default 0. */
	imageDim?: number;
	/** Desaturate the image first. Default false. */
	grayscale?: boolean;
	/** Contrast multiplier around mid-grey, 0.5..2. Default 1. */
	contrast?: number;
	/**
	 * Silhouette cut, 0..1 as a fraction of full brightness. When set, the picture is reduced to
	 * two tones: anything darker than the cut becomes the dark colour, everything else the light
	 * colour, so a logo or glyph comes out as a crisp shape made of modules rather than a soft
	 * photograph. Applied after greyscale and contrast, before the fade. Leave unset (the default)
	 * to keep the picture continuous.
	 */
	threshold?: number;
	/**
	 * Picture zoom relative to cover-fit: 1 fills the data area, 2 shows the middle half, below 1
	 * shrinks the picture and leaves the light colour around it. 0.5..3. Default 1.
	 */
	imageZoom?: number;
	/** Shift the picture sideways, as a fraction of the data area (-0.5..0.5, positive is right). Default 0. */
	imageOffsetX?: number;
	/** Shift the picture up or down, as a fraction of the data area (-0.5..0.5, positive is down). Default 0. */
	imageOffsetY?: number;
}

/** Where the picture lands inside the data area, in whatever unit `area` is (pixels or modules). */
export interface ImagePlacement {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface HalftoneResult {
	/** The raster that decoded, or the last one tried when nothing did. */
	raster: RasterImage;
	/** The option set that produced `raster`, with every default filled in. */
	opts: HalftoneOptions;
	/** One human-readable line per attempt, in order. */
	attempts: string[];
	/** Whether `raster` decoded back to the expected payload. */
	ok: boolean;
	/** Empty when the first attempt worked; otherwise what had to change, in plain language. */
	note: string;
}

export const DOT_SCALE_MIN = 0.25;
export const DOT_SCALE_MAX = 0.7;
export const IMAGE_ZOOM_MIN = 0.5;
export const IMAGE_ZOOM_MAX = 3;
export const IMAGE_OFFSET_MAX = 0.5;
export const THRESHOLD_MIN = 0.05;
export const THRESHOLD_MAX = 0.95;
/** The cut a silhouette starts at: mid-grey, which splits a typical logo cleanly from its paper. */
export const THRESHOLD_DEFAULT = 0.5;
/** Default module budget for an image-bearing symbol: version 7 is 45×45 = 2025 modules (plan §7 step 1). */
export const HALFTONE_MIN_MODULES = 2025;

/**
 * Smallest version whose symbol carries at least `minModules` modules, so a picture has room
 * to read. The caller passes this as `minVersion`; the encoder still raises it further when the
 * payload needs more room at ECC H.
 */
export function halftoneVersionFor(payload: string, minModules = HALFTONE_MIN_MODULES): number {
	let v = 1;
	while (v < 40 && sq(17 + 4 * v) < minModules) v++;
	return v;
}

function sq(n: number): number {
	return n * n;
}

/**
 * Cover-fit the picture into a square data area of side `area`, then apply zoom and offset.
 * Shared by the raster renderer (area in pixels) and the SVG export (area in modules) so the
 * vector file shows exactly the crop that was verified.
 */
export function imagePlacement(
	imageWidth: number,
	imageHeight: number,
	area: number,
	opts: Pick<HalftoneOptions, 'imageZoom' | 'imageOffsetX' | 'imageOffsetY'> = {}
): ImagePlacement {
	const zoom = clamp(opts.imageZoom ?? 1, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX);
	const dx = clamp(opts.imageOffsetX ?? 0, -IMAGE_OFFSET_MAX, IMAGE_OFFSET_MAX);
	const dy = clamp(opts.imageOffsetY ?? 0, -IMAGE_OFFSET_MAX, IMAGE_OFFSET_MAX);
	if (!(imageWidth > 0) || !(imageHeight > 0) || !(area > 0)) return { x: 0, y: 0, width: 0, height: 0 };
	const scale = Math.max(area / imageWidth, area / imageHeight) * zoom;
	const width = imageWidth * scale;
	const height = imageHeight * scale;
	return {
		x: (area - width) / 2 + dx * area,
		y: (area - height) / 2 + dy * area,
		width,
		height
	};
}

/**
 * Render the symbol over the image. Output is RGBA, `(size + 2 * quietZone) * pxPerModule` per side.
 * `onProgress` is called with 0..1 as rows complete, so a worker can report on long renders.
 */
export function renderHalftone(
	qr: Pick<EncodedQr, 'matrix' | 'functionMask' | 'size'>,
	image: RasterImage,
	opts: HalftoneOptions = {},
	onProgress?: (fraction: number) => void
): RasterImage {
	const o = withDefaults(opts);
	const px = o.pxPerModule;
	const quiet = o.quietZone;
	const size = qr.size;
	const total = size + 2 * quiet;
	const side = total * px;
	const data = new Uint8ClampedArray(side * side * 4);
	const [lr, lg, lb] = o.light;

	// 1. Light everywhere, so the quiet zone is clean whatever the image does.
	//    Write one row, then copy it down: far cheaper than touching every pixel in a loop.
	const rowBytes = side * 4;
	for (let x = 0; x < side; x++) {
		const p = x * 4;
		data[p] = lr;
		data[p + 1] = lg;
		data[p + 2] = lb;
		data[p + 3] = 255;
	}
	for (let y = 1; y < side; y++) data.copyWithin(y * rowBytes, 0, rowBytes);

	// 2. Cover-fit the image into the data area only (inside the quiet zone), then zoom and shift.
	//    Anything the picture no longer covers stays the light colour.
	//    Separable bilinear resample: the source is composited and colour-adjusted once, each
	//    source row is resampled horizontally once (two-row rolling cache, since output rows walk
	//    the source monotonically), and every output pixel is then one vertical blend per channel.
	const areaPx = size * px;
	const origin = quiet * px;
	if (areaPx > 0 && image.width > 0 && image.height > 0) {
		const iw = image.width;
		const ih = image.height;
		const src = prepareSource(image, o);
		const place = imagePlacement(iw, ih, areaPx, o);
		const inv = iw / place.width;
		const eps = 1e-6;
		const maxX = iw - 0.5 + eps;
		const maxY = ih - 0.5 + eps;

		// Columns covered by the picture form one interval; per column, the two source columns and blend.
		const colX0 = new Int32Array(areaPx);
		const colX1 = new Int32Array(areaPx);
		const colFx = new Float32Array(areaPx);
		let firstCol = areaPx;
		let lastCol = -1;
		for (let x = 0; x < areaPx; x++) {
			const sx = (x + 0.5 - place.x) * inv - 0.5;
			if (sx < -0.5 - eps || sx > maxX) continue;
			const x0 = Math.floor(sx);
			colX0[x] = (x0 < 0 ? 0 : x0 >= iw ? iw - 1 : x0) * 3;
			const x1 = x0 + 1;
			colX1[x] = (x1 < 0 ? 0 : x1 >= iw ? iw - 1 : x1) * 3;
			colFx[x] = sx - x0;
			if (x < firstCol) firstCol = x;
			lastCol = x;
		}

		let rowA = new Float32Array(areaPx * 3);
		let rowB = new Float32Array(areaPx * 3);
		let cachedA = -1;
		let cachedB = -1;
		const hresample = (srcRow: number, out: Float32Array): void => {
			const base = srcRow * iw * 3;
			for (let x = firstCol; x <= lastCol; x++) {
				const fx = colFx[x]!;
				const i0 = base + colX0[x]!;
				const i1 = base + colX1[x]!;
				const o3 = x * 3;
				out[o3] = src[i0]! + (src[i1]! - src[i0]!) * fx;
				out[o3 + 1] = src[i0 + 1]! + (src[i1 + 1]! - src[i0 + 1]!) * fx;
				out[o3 + 2] = src[i0 + 2]! + (src[i1 + 2]! - src[i0 + 2]!) * fx;
			}
		};

		const progressEvery = Math.max(1, Math.floor(areaPx / 50));
		for (let y = 0; y < areaPx; y++) {
			if (onProgress && y % progressEvery === 0) onProgress(y / areaPx);
			const sy = (y + 0.5 - place.y) * inv - 0.5;
			if (sy < -0.5 - eps || sy > maxY) continue;
			const y0 = Math.floor(sy);
			const fy = sy - y0;
			const y0c = y0 < 0 ? 0 : y0 >= ih ? ih - 1 : y0;
			const y1 = y0 + 1;
			const y1c = y1 < 0 ? 0 : y1 >= ih ? ih - 1 : y1;
			if (cachedA !== y0c) {
				if (cachedB === y0c) {
					const t = rowA;
					rowA = rowB;
					rowB = t;
					cachedB = cachedA;
				} else {
					hresample(y0c, rowA);
				}
				cachedA = y0c;
			}
			if (cachedB !== y1c) {
				hresample(y1c, rowB);
				cachedB = y1c;
			}
			const rowBase = ((y + origin) * side + origin) * 4;
			const a = rowA;
			const b = rowB;
			for (let x = firstCol; x <= lastCol; x++) {
				const i = x * 3;
				const p = rowBase + x * 4;
				// Uint8ClampedArray clamps and rounds on store.
				data[p] = a[i]! + (b[i]! - a[i]!) * fy;
				data[p + 1] = a[i + 1]! + (b[i + 1]! - a[i + 1]!) * fy;
				data[p + 2] = a[i + 2]! + (b[i + 2]! - a[i + 2]!) * fy;
			}
		}
	}

	// 3. Function patterns solid, data modules as centred dots.
	const dotPx = Math.min(px, Math.max(2, Math.round(o.dotScale * px)));
	const dotOff = Math.floor((px - dotPx) / 2);
	for (let my = 0; my < size; my++) {
		const row = qr.matrix[my];
		const fn = qr.functionMask[my];
		if (!row || !fn) continue;
		const y0 = (my + quiet) * px;
		for (let mx = 0; mx < size; mx++) {
			const colour = row[mx] === true ? o.dark : o.light;
			const x0 = (mx + quiet) * px;
			if (fn[mx] === true) fillRect(data, side, x0, y0, px, px, colour);
			else fillRect(data, side, x0 + dotOff, y0 + dotOff, dotPx, dotPx, colour);
		}
	}

	onProgress?.(1);
	return { width: side, height: side, data };
}

/**
 * Plan §7 step 6: render, decode, and step through progressively safer settings until the code
 * reads. Returns the first set that decoded; when nothing does, the last attempt with `ok: false`
 * so the UI can still show something and explain what to change.
 */
export function halftoneWithFallback(
	qr: Pick<EncodedQr, 'matrix' | 'functionMask' | 'size'>,
	image: RasterImage,
	expectedPayload: string,
	opts: HalftoneOptions = {}
): HalftoneResult {
	const base = withDefaults(opts);
	const ladder: { opts: HalftoneOptions; label: string; note: string }[] = [
		{ opts: base, label: `dots ${fmt(base.dotScale)}, fade ${pct(base.imageDim)}`, note: '' },
		{
			opts: { ...base, dotScale: 0.5 },
			label: 'larger dots (0.5)',
			note: 'Used larger dots (0.5) so the code decodes.'
		},
		{
			opts: { ...base, imageDim: clamp(base.imageDim + 0.2, 0, 1) },
			label: `faded the picture to ${pct(clamp(base.imageDim + 0.2, 0, 1))}`,
			note: `Faded the picture to ${pct(clamp(base.imageDim + 0.2, 0, 1))} so the code decodes.`
		},
		{
			opts: { ...base, dotScale: 0.5, imageDim: clamp(base.imageDim + 0.2, 0, 1) },
			label: `larger dots (0.5) and a ${pct(clamp(base.imageDim + 0.2, 0, 1))} fade`,
			note: `Used larger dots (0.5) and faded the picture to ${pct(clamp(base.imageDim + 0.2, 0, 1))} so the code decodes.`
		},
		{
			opts: { ...base, dotScale: 0.6, imageDim: 0.4 },
			label: 'largest dots (0.6) and a 40% fade',
			note: 'Used the largest dots (0.6) and a 40% fade so the code decodes. The picture is faint at this setting; try a simpler image or shorter content.'
		}
	];

	const attempts: string[] = [];
	let last: RasterImage | null = null;
	let lastOpts: HalftoneOptions = base;
	for (const step of ladder) {
		const raster = renderHalftone(qr, image, step.opts);
		const res = verifyRaster(raster, expectedPayload);
		attempts.push(`${step.label}: ${res.ok ? 'decoded' : 'did not decode'}`);
		if (res.ok) return { raster, opts: step.opts, attempts, ok: true, note: step.note };
		last = raster;
		lastOpts = step.opts;
	}
	return {
		raster: last ?? renderHalftone(qr, image, base),
		opts: lastOpts,
		attempts,
		ok: false,
		note: 'This picture is too busy for the code to survive. Try a simpler or lighter image, bigger dots, or shorter content.'
	};
}

type Resolved = Required<Omit<HalftoneOptions, 'threshold'>> & { threshold: number | undefined };

function withDefaults(o: HalftoneOptions): Resolved {
	return {
		pxPerModule: Math.max(1, Math.floor(o.pxPerModule ?? 8)),
		quietZone: Math.max(0, Math.floor(o.quietZone ?? 4)),
		dotScale: clamp(o.dotScale ?? 0.4, DOT_SCALE_MIN, DOT_SCALE_MAX),
		dark: o.dark ?? [0, 0, 0],
		light: o.light ?? [255, 255, 255],
		ink: o.ink ?? o.dark ?? [0, 0, 0],
		imageDim: clamp(o.imageDim ?? 0, 0, 1),
		grayscale: o.grayscale ?? false,
		contrast: clamp(o.contrast ?? 1, 0.5, 2),
		threshold: o.threshold === undefined || o.threshold === null ? undefined : clamp(o.threshold, THRESHOLD_MIN, THRESHOLD_MAX),
		imageZoom: clamp(o.imageZoom ?? 1, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX),
		imageOffsetX: clamp(o.imageOffsetX ?? 0, -IMAGE_OFFSET_MAX, IMAGE_OFFSET_MAX),
		imageOffsetY: clamp(o.imageOffsetY ?? 0, -IMAGE_OFFSET_MAX, IMAGE_OFFSET_MAX)
	};
}

/**
 * The picture exactly as the renderer will blend it: alpha composited over the light colour,
 * then greyscale, contrast, the silhouette cut, and the fade applied, as 8-bit RGBA at the
 * source size. The SVG export embeds this so the vector file shows the same picture that was
 * verified. `renderHalftone` uses the same pass internally (as packed RGB).
 */
export function prepareImage(image: RasterImage, opts: HalftoneOptions = {}): RasterImage {
	const rgb = prepareSource(image, withDefaults(opts));
	const n = image.width * image.height;
	const out = new Uint8ClampedArray(n * 4);
	for (let i = 0, p = 0, q = 0; i < n; i++, p += 3, q += 4) {
		out[q] = rgb[p]!;
		out[q + 1] = rgb[p + 1]!;
		out[q + 2] = rgb[p + 2]!;
		out[q + 3] = 255;
	}
	return { width: image.width, height: image.height, data: out };
}

/**
 * The source as 8-bit RGB with alpha composited over the light colour and the greyscale,
 * contrast, silhouette cut, and fade applied. Done once per render so the resample loops stay
 * tight. Contrast and fade are affine, so applying them before interpolation is the same as
 * after, up to clamping at the extremes. The cut is not affine, which is exactly why it has to
 * happen here on source pixels: thresholding after resampling would leave a soft, grey edge.
 */
function prepareSource(image: RasterImage, o: Resolved): Uint8ClampedArray {
	const n = image.width * image.height;
	const channels = image.data.length >= n * 4 ? 4 : 3;
	const out = new Uint8ClampedArray(n * 3);
	const [lr, lg, lb] = o.light;
	// The cut is the only place the shape's own colour applies; everything else keeps `dark`.
	const [dr, dg, db] = o.ink;
	const cut = o.threshold;
	// A silhouette is a luminance decision, so it always goes through grey first.
	const gray = o.grayscale || cut !== undefined;
	const contrast = o.contrast;
	const cut255 = cut === undefined ? -1 : cut * 255;
	const dim = o.imageDim;
	const src = image.data;
	for (let i = 0; i < n; i++) {
		const p = i * channels;
		let r = src[p] ?? 0;
		let g = src[p + 1] ?? 0;
		let b = src[p + 2] ?? 0;
		if (channels === 4) {
			const a = (src[p + 3] ?? 255) / 255;
			if (a < 1) {
				r = r * a + lr * (1 - a);
				g = g * a + lg * (1 - a);
				b = b * a + lb * (1 - a);
			}
		}
		if (gray) {
			const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			r = l;
			g = l;
			b = l;
		}
		if (contrast !== 1) {
			r = (r - 128) * contrast + 128;
			g = (g - 128) * contrast + 128;
			b = (b - 128) * contrast + 128;
		}
		if (cut255 >= 0) {
			// r holds the (contrast-adjusted) luminance here because `gray` is forced on.
			if (r < cut255) {
				r = dr;
				g = dg;
				b = db;
			} else {
				r = lr;
				g = lg;
				b = lb;
			}
		}
		if (dim > 0) {
			r += (lr - r) * dim;
			g += (lg - g) * dim;
			b += (lb - b) * dim;
		}
		const q = i * 3;
		out[q] = r;
		out[q + 1] = g;
		out[q + 2] = b;
	}
	return out;
}

function fillRect(
	data: Uint8ClampedArray,
	side: number,
	x0: number,
	y0: number,
	w: number,
	h: number,
	c: [number, number, number]
): void {
	for (let y = y0; y < y0 + h; y++) {
		if (y < 0 || y >= side) continue;
		for (let x = x0; x < x0 + w; x++) {
			if (x < 0 || x >= side) continue;
			const p = (y * side + x) * 4;
			data[p] = c[0];
			data[p + 1] = c[1];
			data[p + 2] = c[2];
			data[p + 3] = 255;
		}
	}
}

function clamp(v: number, lo: number, hi: number): number {
	if (!Number.isFinite(v)) return lo;
	return v < lo ? lo : v > hi ? hi : v;
}

function clampInt(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

function fmt(n: number): string {
	return Number(n.toFixed(2)).toString();
}

function pct(n: number): string {
	return `${Math.round(n * 100)}%`;
}
