/**
 * The crop box is the engine's picture placement run backwards. The engine draws the picture
 * over the data area at cover-fit times `zoom`, centred, then shifted by the two offsets as
 * fractions of the area (`imagePlacement` in the engine). The box on the thumbnail is that same
 * data area expressed in picture coordinates, 0 to 1 across the picture, so dragging the box
 * changes the offsets and dragging its corner changes the zoom. Nothing here touches pixels.
 *
 * `CropBox.svelte` itself knows nothing about zooms or offsets: it drives a `CropModel`, which
 * turns pointer and keyboard gestures into writes on whatever fields own the crop. This file
 * holds the model for the Artistic QR placement; `logo-crop.ts` holds the free one for the logo.
 */
import { IMAGE_OFFSET_MAX, IMAGE_ZOOM_MAX, IMAGE_ZOOM_MIN } from '@stoneqr/engine';

/** A box on the picture: top-left corner and size, 1 being the whole picture. */
export interface CropRect {
	u: number;
	v: number;
	w: number;
	h: number;
}

/**
 * What the crop box needs from the fields it edits. Every call takes the picture's aspect
 * (width over height) because the box only exists once the picture's size is known, and the
 * placement model cannot turn a box into offsets without it.
 */
export interface CropModel {
	/** Where the box sits on the picture right now. */
	rect(aspect: number): CropRect;
	/** Put the box's top-left corner at (u, v). */
	moveTo(aspect: number, u: number, v: number): void;
	/**
	 * The corner handle was dragged: the box's top-left corner as it was when the drag began,
	 * the width and height the pointer is asking for, the axis it moved more along, and whether
	 * the shape is to be kept (Shift held).
	 */
	resizeTo(aspect: number, u: number, v: number, w: number, h: number, axis: 'w' | 'h', keepShape: boolean): void;
	/** One keyboard step in (1) or out (-1). */
	zoomStep(aspect: number, direction: 1 | -1): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampOffset = (v: number) => clamp(v, -IMAGE_OFFSET_MAX, IMAGE_OFFSET_MAX);
export const clampZoom = (v: number) => clamp(v, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX);

/** The picture's size in data-area units at this zoom: cover-fit makes the short side 1. */
function extent(aspect: number, zoom: number): { w: number; h: number } {
	return { w: Math.max(1, aspect) * zoom, h: Math.max(1 / aspect, 1) * zoom };
}

/** Where the data area sits on the picture for these settings. `aspect` is width over height. */
export function cropRect(aspect: number, zoom: number, offsetX: number, offsetY: number): CropRect {
	const { w, h } = extent(aspect, zoom);
	const x = (1 - w) / 2 + offsetX;
	const y = (1 - h) / 2 + offsetY;
	return { u: -x / w, v: -y / h, w: 1 / w, h: 1 / h };
}

/** The offsets that put the box's top-left corner at (u, v), clamped to what the engine accepts. */
export function offsetsFor(aspect: number, zoom: number, u: number, v: number): { offsetX: number; offsetY: number } {
	const { w, h } = extent(aspect, zoom);
	return { offsetX: clampOffset(-u * w - (1 - w) / 2), offsetY: clampOffset(-v * h - (1 - h) / 2) };
}

/**
 * The zoom that gives the box this width or height on the picture. The corner handle moves in
 * both axes; the caller passes whichever it moved more, so the box follows the pointer.
 */
export function zoomForBox(aspect: number, size: number, axis: 'w' | 'h'): number {
	const cover = axis === 'w' ? Math.max(1, aspect) : Math.max(1 / aspect, 1);
	return clampZoom(1 / (Math.max(size, 1e-6) * cover));
}

export interface Placement {
	zoom: number;
	offsetX: number;
	offsetY: number;
}

/**
 * The crop model for the engine's placement: the box is the data area, always the shape of the
 * code, so the corner handle only zooms and a request to keep the shape is already met. The
 * corner passed to `resizeTo` is the one from the start of the drag, so a corner clamped by the
 * engine's offset limit is re-anchored on every move rather than drifting a little each time.
 */
export function placementModel(read: () => Placement, write: (p: Partial<Placement>) => void): CropModel {
	return {
		rect(aspect) {
			const p = read();
			return cropRect(aspect, p.zoom, p.offsetX, p.offsetY);
		},
		moveTo(aspect, u, v) {
			write(offsetsFor(aspect, read().zoom, u, v));
		},
		resizeTo(aspect, u, v, w, h, axis) {
			const zoom = zoomForBox(aspect, axis === 'w' ? w : h, axis);
			write({ zoom, ...offsetsFor(aspect, zoom, u, v) });
		},
		zoomStep(_aspect, direction) {
			write({ zoom: clampZoom(read().zoom + 0.05 * direction) });
		}
	};
}
