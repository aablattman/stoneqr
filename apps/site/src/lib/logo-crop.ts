/**
 * Cropping the centre logo.
 *
 * The blank space the logo sits in is the frame: the crop box on the logo's thumbnail is that
 * space, and whatever it covers is what goes in the middle of the code. Unlike the Artistic QR
 * crop, the box is free in shape, because a logo file is rarely the shape of the mark someone
 * wants (a wordmark with the mark at one end, a square export with padding all round), and the
 * hole the renderer cuts follows the box's shape rather than the file's. It is also bounded to
 * the picture: there is nothing to draw outside it, and breathing room is the Margin setting.
 *
 * The crop is four fractions of the picture on the design (`logoCropX/Y/W/H`, whole picture by
 * default). Everything here is pure arithmetic on those, tested in `test/logo-crop.test.ts`,
 * except `cropLogo` at the bottom, which needs a canvas or the SVG rebuild and runs in the
 * Preview.
 */
import type { CropModel, CropRect } from './crop';

/** The whole picture, which is the default and what "Reset crop" goes back to. */
export const FULL_CROP: CropRect = { u: 0, v: 0, w: 1, h: 1 };

/**
 * The smallest side the box can be, as a share of the picture. An eighth keeps a mark picked
 * out of a wide banner usable and puts a ceiling on the zoom the slider has to show.
 */
export const CROP_MIN = 0.125;
export const LOGO_ZOOM_MIN = 1;
export const LOGO_ZOOM_MAX = 1 / CROP_MIN;

/** Cropped pictures are re-encoded at their own resolution, capped here so a 2 MB photo does not become a 2 MB logo. */
export const CROP_MAX_PX = 2048;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Four decimals: a thousandth of the picture is finer than any pointer, and keeps share links short. */
const round = (v: number) => Math.round(v * 10000) / 10000;

function tidy(u: number, v: number, w: number, h: number): CropRect {
	return { u: round(u), v: round(v), w: round(w), h: round(h) };
}

/**
 * A crop that can be drawn: every number finite, the sides between `CROP_MIN` and 1, the box
 * inside the picture. Anything that cannot be repaired is the whole picture, which is what a
 * design file with nonsense in these four fields deserves.
 */
export function normaliseCrop(c: Partial<CropRect> | null | undefined): CropRect {
	const u = c?.u ?? 0;
	const v = c?.v ?? 0;
	const w = c?.w ?? 1;
	const h = c?.h ?? 1;
	if (![u, v, w, h].every(Number.isFinite)) return FULL_CROP;
	const cw = clamp(w, CROP_MIN, 1);
	const ch = clamp(h, CROP_MIN, 1);
	return tidy(clamp(u, 0, 1 - cw), clamp(v, 0, 1 - ch), cw, ch);
}

export function isFullCrop(c: CropRect): boolean {
	return Math.abs(c.u) < 1e-6 && Math.abs(c.v) < 1e-6 && Math.abs(c.w - 1) < 1e-6 && Math.abs(c.h - 1) < 1e-6;
}

/** The box moved so its top-left corner is at (u, v), held inside the picture. */
export function moveCrop(c: CropRect, u: number, v: number): CropRect {
	return normaliseCrop({ ...c, u, v });
}

/**
 * The box resized from its corner, the top-left corner staying put. `keepShape` holds the box's
 * current proportions and follows whichever axis the pointer moved more along; a box that would
 * leave the picture is stopped at the edge, shape and all.
 */
export function resizeCrop(c: CropRect, u: number, v: number, w: number, h: number, axis: 'w' | 'h', keepShape: boolean): CropRect {
	const ratio = c.h / c.w;
	let cw = w;
	let ch = h;
	if (keepShape) {
		if (axis === 'w') ch = cw * ratio;
		else cw = ch / ratio;
		// Stopped by an edge: shrink the other side to match, so the shape survives the clamp.
		if (cw > 1 - u) {
			cw = 1 - u;
			ch = cw * ratio;
		}
		if (ch > 1 - v) {
			ch = 1 - v;
			cw = ch / ratio;
		}
	}
	cw = clamp(cw, CROP_MIN, 1 - u);
	ch = clamp(ch, CROP_MIN, 1 - v);
	return normaliseCrop({ u, v, w: cw, h: ch });
}

/** How far the box is zoomed in: 1 when it is the whole picture along its longer side. */
export function cropZoom(c: CropRect): number {
	return 1 / Math.max(c.w, c.h);
}

/**
 * The box scaled about its centre so its longer side is 1 / zoom of the picture, keeping its
 * shape unless the picture's edge forbids it. This is the Zoom slider and the plus and minus keys.
 */
export function zoomCrop(c: CropRect, zoom: number): CropRect {
	const side = 1 / clamp(zoom, LOGO_ZOOM_MIN, LOGO_ZOOM_MAX);
	const ratio = c.h / c.w;
	let w = c.w >= c.h ? side : side / ratio;
	let h = c.w >= c.h ? side * ratio : side;
	w = clamp(w, CROP_MIN, 1);
	h = clamp(h, CROP_MIN, 1);
	const cx = c.u + c.w / 2;
	const cy = c.v + c.h / 2;
	return normaliseCrop({ u: cx - w / 2, v: cy - h / 2, w, h });
}

/**
 * The hole's proportions, height over width, for a picture of `pictureAspect` (height over
 * width) cropped to `c`. This is what the sizing port cuts the hole for.
 */
export function cropAspect(c: CropRect, pictureAspect: number): number {
	if (!(pictureAspect > 0) || !Number.isFinite(pictureAspect)) return 1;
	return (c.h / c.w) * pictureAspect;
}

/** One keyboard step of zoom, as a factor. */
const ZOOM_STEP = 1.1;

/** The crop box model for the logo: free in shape, bounded to the picture. */
export function freeCropModel(read: () => CropRect, write: (c: CropRect) => void): CropModel {
	return {
		rect: () => normaliseCrop(read()),
		moveTo: (_aspect, u, v) => write(moveCrop(read(), u, v)),
		resizeTo: (_aspect, u, v, w, h, axis, keepShape) => write(resizeCrop(read(), u, v, w, h, axis, keepShape)),
		zoomStep(_aspect, direction) {
			const c = read();
			write(zoomCrop(c, cropZoom(c) * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
		}
	};
}

/* ------------------------------------------------------------------ the browser half */

/**
 * The picture the renderer is handed: the logo cut down to the crop. A whole-picture crop returns
 * the logo untouched, so the common case is byte for byte what it was. An SVG is rebuilt as a
 * vector wrapper (`cropSvgDataUrl` in `logo-svg.ts`, loaded on demand like the rest of that
 * module) because a logo that arrived as a drawing must leave as one; anything else goes through
 * a canvas and comes back as a PNG at the crop's own resolution, capped at `CROP_MAX_PX`.
 */
export async function cropLogo(dataUrl: string, crop: CropRect): Promise<string> {
	const c = normaliseCrop(crop);
	if (isFullCrop(c)) return dataUrl;
	if (/^data:image\/svg\+xml[;,]/i.test(dataUrl)) {
		const { cropSvgDataUrl } = await import('./logo-svg');
		return cropSvgDataUrl(dataUrl, c);
	}
	const img = await loadPicture(dataUrl);
	const W = img.naturalWidth;
	const H = img.naturalHeight;
	const sx = Math.round(c.u * W);
	const sy = Math.round(c.v * H);
	const sw = Math.max(1, Math.min(W - sx, Math.round(c.w * W)));
	const sh = Math.max(1, Math.min(H - sy, Math.round(c.h * H)));
	const scale = Math.min(1, CROP_MAX_PX / Math.max(sw, sh));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(sw * scale));
	canvas.height = Math.max(1, Math.round(sh * scale));
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not crop the logo: no canvas');
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL('image/png');
}

function loadPicture(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => (img.naturalWidth && img.naturalHeight ? resolve(img) : reject(new Error('The logo has no size')));
		img.onerror = () => reject(new Error('Could not read the logo'));
		img.src = src;
	});
}
