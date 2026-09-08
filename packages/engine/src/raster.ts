import type { EncodedQr, RasterImage } from './types.js';

export interface RasterOptions {
	/** Pixels per module. Default 8. */
	pxPerModule?: number;
	/** Quiet zone in modules. Default 4. */
	quietZone?: number;
	/** RGB 0..255 for dark modules. Default black. */
	fg?: [number, number, number];
	/** RGB 0..255 for light modules. Default white. */
	bg?: [number, number, number];
	/**
	 * Write light pixels with alpha 0, so a PNG shows whatever it is placed on; they keep the
	 * light colour underneath, so nothing resampling the edges bleeds black in. Default false.
	 */
	transparent?: boolean;
}

/**
 * Rasterise a matrix into an RGBA buffer with no canvas, so it runs in Node, Workers, and tests.
 * Used by `verify` and by the PNG exporter.
 */
export function rasterize(qr: Pick<EncodedQr, 'matrix' | 'size'>, opts: RasterOptions = {}): RasterImage {
	const px = Math.max(1, Math.floor(opts.pxPerModule ?? 8));
	const quiet = opts.quietZone ?? 4;
	const fg = opts.fg ?? [0, 0, 0];
	const bg = opts.bg ?? [255, 255, 255];
	const lightAlpha = opts.transparent ? 0 : 255;
	const total = qr.size + 2 * quiet;
	const side = total * px;
	const data = new Uint8ClampedArray(side * side * 4);
	for (let y = 0; y < side; y++) {
		const my = Math.floor(y / px) - quiet;
		const row = my >= 0 && my < qr.size ? qr.matrix[my]! : undefined;
		for (let x = 0; x < side; x++) {
			const mx = Math.floor(x / px) - quiet;
			const dark = row !== undefined && mx >= 0 && mx < qr.size && row[mx] === true;
			const c = dark ? fg : bg;
			const i = (y * side + x) * 4;
			data[i] = c[0];
			data[i + 1] = c[1];
			data[i + 2] = c[2];
			data[i + 3] = dark ? 255 : lightAlpha;
		}
	}
	return { width: side, height: side, data };
}
