/**
 * How big a Photo QR PNG comes out, and the dpi that makes it print at the size asked for.
 *
 * The raster is capped at 4096 px a side (about 17 megapixels): the picture is at most 1024 px to
 * begin with, so more pixels add nothing, and past this PNG encoding alone takes seconds on a
 * laptop. A capped file has fewer pixels than the requested dpi implies, so its pHYs chunk must
 * carry the dpi that reproduces the requested width from the pixels it actually has, which is
 * what the engine's `exportPng` does for plain codes. Pure, so the arithmetic is testable.
 */
export const HALFTONE_MAX_SIDE = 4096;

export interface HalftonePngSize {
	/** Pixels per module the renderer is asked for, at least 2. */
	pxPerModule: number;
	/** Side of the PNG in pixels, quiet zone included. */
	widthPx: number;
	/** The dpi to write into the file so it opens at `widthMm`. */
	dpi: number;
	/** True when the cap held the file below the size the requested dpi would have produced. */
	capped: boolean;
}

/**
 * @param modules  modules per side including the quiet zone
 * @param widthMm  the printed width asked for
 * @param dpi      the resolution asked for
 */
export function halftonePngSize(modules: number, widthMm: number, dpi: number): HalftonePngSize {
	const wanted = Math.max(2, Math.round(((widthMm / 25.4) * dpi) / modules));
	const cap = Math.max(2, Math.floor(HALFTONE_MAX_SIDE / modules));
	const pxPerModule = Math.min(cap, wanted);
	const widthPx = pxPerModule * modules;
	return {
		pxPerModule,
		widthPx,
		dpi: widthMm > 0 ? widthPx / (widthMm / 25.4) : dpi,
		capped: wanted > cap
	};
}
