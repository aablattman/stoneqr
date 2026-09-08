/**
 * Browser glue for the engine's halftone renderer (plan §7). Browser only.
 * The uploaded picture is decoded on a canvas and never leaves the device.
 */
import { escapeXml, imagePlacement, THRESHOLD_MAX, THRESHOLD_MIN, type EncodedQr, type HalftoneOptions, type RasterImage } from '@stoneqr/engine';

/** Decode a data URL onto a canvas and return its pixels, downscaled so the long side fits `maxSide`. */
export async function loadImageRaster(dataUrl: string, maxSide = 1024): Promise<RasterImage> {
	const img = new Image();
	img.decoding = 'async';
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('That image could not be read. Try a PNG, JPEG, or WebP.'));
		img.src = dataUrl;
	});
	const w0 = img.naturalWidth || img.width;
	const h0 = img.naturalHeight || img.height;
	if (!w0 || !h0) throw new Error('That image has no pixels.');
	const scale = Math.min(1, maxSide / Math.max(w0, h0));
	const w = Math.max(1, Math.round(w0 * scale));
	const h = Math.max(1, Math.round(h0 * scale));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('This browser could not open a canvas to read the image.');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, w, h);
	const data = ctx.getImageData(0, 0, w, h);
	return { width: data.width, height: data.height, data: data.data };
}

/** Turn an engine raster back into a PNG blob, pixel for pixel. */
export async function rasterToPngBlob(raster: RasterImage): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = raster.width;
	canvas.height = raster.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('This browser could not open a canvas.');
	// Copy into a fresh, non-shared buffer so ImageData accepts it.
	const clamped = new Uint8ClampedArray(raster.data);
	ctx.putImageData(new ImageData(clamped, raster.width, raster.height), 0, 0);
	return await new Promise<Blob>((resolve, reject) =>
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
	);
}

/**
 * Two-layer SVG (plan §7 step 7): the picture underneath, clipped to the data area, and one path
 * carrying every solid function module and every data dot, in module units so it scales cleanly.
 * `source` is the picture's pixel size, so the zoom and position match the raster the preview verified.
 */
export function halftoneToSvg(
	qr: EncodedQr,
	source: { width: number; height: number },
	imageDataUrl: string,
	opts: HalftoneOptions = {},
	widthMm = 30
): string {
	const quiet = Math.max(0, Math.floor(opts.quietZone ?? 4));
	const dotScale = Math.min(0.7, Math.max(0.25, opts.dotScale ?? 0.4));
	const dark = rgb(opts.dark ?? [0, 0, 0]);
	const light = rgb(opts.light ?? [255, 255, 255]);
	const total = qr.size + 2 * quiet;
	const w = fmt(widthMm);
	const id = 'sq-halftone-clip';
	// The engine renders the picture with the same fade/greyscale baked in; the SVG layer keeps the
	// original file and reproduces the adjustments with filters so the vector stays editable.
	const filter = imageFilter(opts);
	const place = imagePlacement(source.width, source.height, qr.size, opts);
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
		`width="${w}mm" height="${w}mm" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
		`<title>QR code over a picture</title>` +
		`<defs><clipPath id="${id}"><rect x="${quiet}" y="${quiet}" width="${qr.size}" height="${qr.size}"/></clipPath>${filter.defs}</defs>` +
		`<rect width="${total}" height="${total}" fill="${light}"/>` +
		`<g clip-path="url(#${id})">` +
		`<image x="${num(quiet + place.x)}" y="${num(quiet + place.y)}" width="${num(place.width)}" height="${num(place.height)}" ` +
		`preserveAspectRatio="none"${filter.attr} href="${escapeXml(imageDataUrl)}" xlink:href="${escapeXml(imageDataUrl)}"/>` +
		`</g>` +
		`<path d="${halftonePath(qr, quiet, dotScale, false)}" fill="${light}"/>` +
		`<path d="${halftonePath(qr, quiet, dotScale, true)}" fill="${dark}"/>` +
		`</svg>`
	);
}

/**
 * Path data for every module of one polarity: function modules as full squares, data modules as
 * centred sub-squares. `offset` shifts by the quiet zone; units are modules, so it prints at any size.
 */
export function halftonePath(
	qr: Pick<EncodedQr, 'matrix' | 'functionMask' | 'size'>,
	offset: number,
	dotScale: number,
	wantDark: boolean
): string {
	const inset = Number(((1 - dotScale) / 2).toFixed(4));
	const dot = Number(dotScale.toFixed(4));
	let d = '';
	for (let y = 0; y < qr.size; y++) {
		const row = qr.matrix[y];
		const fn = qr.functionMask[y];
		if (!row || !fn) continue;
		let x = 0;
		while (x < qr.size) {
			if ((row[x] === true) !== wantDark) {
				x++;
				continue;
			}
			if (fn[x] === true) {
				// Merge adjacent solid function modules on this row into one run, as renderSvg does.
				let run = 1;
				while (x + run < qr.size && fn[x + run] === true && (row[x + run] === true) === wantDark) run++;
				d += `M${x + offset} ${y + offset}h${run}v1h-${run}z`;
				x += run;
			} else {
				const px = num(x + offset + inset);
				const py = num(y + offset + inset);
				d += `M${px} ${py}h${dot}v${dot}h-${dot}z`;
				x++;
			}
		}
	}
	return d;
}

/** How steep the silhouette cut is in the SVG filter: 512 makes the grey band narrower than one 8-bit level. */
export const SVG_THRESHOLD_SLOPE = 512;

/**
 * An SVG filter reproducing the greyscale / contrast / silhouette / fade the raster preview
 * shows, in the order the engine's prepareSource applies them.
 */
export function imageFilter(opts: HalftoneOptions): { defs: string; attr: string } {
	const dim = Math.min(1, Math.max(0, opts.imageDim ?? 0));
	const contrast = Math.min(2, Math.max(0.5, opts.contrast ?? 1));
	const cut = opts.threshold === undefined || opts.threshold === null ? undefined : Math.min(THRESHOLD_MAX, Math.max(THRESHOLD_MIN, opts.threshold));
	const gray = opts.grayscale === true || cut !== undefined;
	if (!gray && dim === 0 && contrast === 1) return { defs: '', attr: '' };
	const id = 'sq-halftone-adjust';
	const grayscale = gray ? `<feColorMatrix type="saturate" values="0"/>` : '';
	const linear = (slope: string, intercept: string) =>
		`<feComponentTransfer>${['R', 'G', 'B'].map((c) => `<feFunc${c} type="linear" slope="${slope}" intercept="${intercept}"/>`).join('')}</feComponentTransfer>`;
	let stages: string;
	if (cut === undefined) {
		// Contrast around mid-grey, then a linear fade toward white, matching the engine.
		stages = linear(num(contrast * (1 - dim)), num(((128 - 128 * contrast) / 255) * (1 - dim) + dim));
	} else {
		// Contrast first, then a near-vertical ramp at the cut so every pixel lands on 0 or 1, then a
		// two-entry table that maps 0 to the ink colour and 1 to the paper colour. The fade is folded
		// into the table: the ink end moves toward paper, exactly as the engine fades a silhouette.
		// The ink end is `ink`, defaulting to `dark`, the same fallback `withDefaults` applies, because
		// this table is the SVG's copy of what `prepareSource` does at the cut.
		const dark = opts.ink ?? opts.dark ?? [0, 0, 0];
		const light = opts.light ?? [255, 255, 255];
		const contrastStage = contrast === 1 ? '' : linear(num(contrast), num((128 - 128 * contrast) / 255));
		const cutStage = linear(String(SVG_THRESHOLD_SLOPE), num(0.5 - SVG_THRESHOLD_SLOPE * cut));
		const table = ['R', 'G', 'B']
			.map((c, i) => {
				const d = (dark[i]! + (light[i]! - dark[i]!) * dim) / 255;
				const l = light[i]! / 255;
				return `<feFunc${c} type="table" tableValues="${num(d)} ${num(l)}"/>`;
			})
			.join('');
		stages = `${contrastStage}${cutStage}<feComponentTransfer>${table}</feComponentTransfer>`;
	}
	return {
		defs: `<filter id="${id}" color-interpolation-filters="sRGB">${grayscale}${stages}</filter>`,
		attr: ` filter="url(#${id})"`
	};
}

function rgb(c: [number, number, number]): string {
	return `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function num(n: number): string {
	return Number(n.toFixed(4)).toString();
}

function fmt(n: number): string {
	return Number(n.toFixed(3)).toString();
}
