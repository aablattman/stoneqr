/**
 * Styled rendering behind a lazy import of @liquid-js/qr-code-styling (browser only).
 * The library re-encodes internally; we pass the same ECC and force the same version so
 * the module count matches the engine's sizing math, then read the real count back.
 *
 * The call-to-action frame is our own SVG wrapper around the library's output. The library's
 * BorderPlugin draws a stroke ring with text on a path and sizes the text as the whole code
 * when `proportional` is set, which is not a label band; a plain wrapper is smaller and predictable.
 */
import { escapeXml, type Ecc } from '@stoneqr/engine';

export type DotStyle = 'square' | 'rounded' | 'dots' | 'classy' | 'extra-rounded';
export type CornerSquareStyle = 'square' | 'extra-rounded' | 'dot' | 'classy';
export type CornerDotStyle = 'square' | 'dot' | 'classy';
export type GradientKind = 'none' | 'linear' | 'radial';

export interface StyleOptions {
	payload: string;
	ecc: Ecc;
	version: number;
	quietZone: number;
	fg: string;
	bg: string; // '#rrggbb' or 'transparent'
	/** Colour for the three finder patterns; they take `fg` and its gradient when unset. */
	cornerColor?: string;
	dot: DotStyle;
	cornerSquare: CornerSquareStyle;
	cornerDot: CornerDotStyle;
	gradient: GradientKind;
	gradientTo: string;
	gradientAngleDeg: number;
	logo?: string; // data URL (raster), stays in the browser
	/**
	 * The library's `imageOptions.imageSize`: a coefficient of the error-correction budget, not a
	 * size. Work it out with `fitLogo` in `logo-size.ts` from the width the user asked for; do not
	 * pass a fraction of the width here, which is what it looks like and is not.
	 */
	logoCoefficient: number;
	/** True clears the modules under the logo; false paints it straight over them. */
	logoKnockout: boolean;
	logoMargin: number; // modules; the library ignores it when the logo is painted over
	frame: { enabled: boolean; text: string; color: string; textColor: string };
	/** Accessible name written as the SVG's `<title>`, as the plain renderer does. */
	title?: string;
}

export interface StyledResult {
	svg: string;
	/** Modules per side that the library actually produced. */
	size: number;
	/**
	 * Width of the whole artwork divided by the width of the code itself: 1 without a frame,
	 * a little more with one. Exports multiply the print width by this so the code stays the
	 * size the user asked for and the frame is added around it.
	 */
	scale: number;
}

/** Frame proportions relative to the code width (which already includes its quiet zone). */
export const FRAME = { edge: 0.04, band: 0.17, radius: 0.045, maxChars: 40 } as const;

const DOT_MAP: Record<DotStyle, string> = {
	square: 'square',
	rounded: 'rounded',
	dots: 'dot',
	classy: 'classy',
	'extra-rounded': 'extra-rounded'
};

const ECC_MAP: Record<Ecc, string> = { L: 'L', M: 'M', Q: 'Q', H: 'H' };

let libPromise: Promise<typeof import('@liquid-js/qr-code-styling')> | undefined;

export function preloadStyled(): void {
	libPromise ??= import('@liquid-js/qr-code-styling');
}

/**
 * Render a styled SVG. The output keeps the library's pixel viewBox; we rewrite width/height to mm
 * so the file opens at physical size in Illustrator, Inkscape, and print RIPs.
 */
export async function renderStyled(opts: StyleOptions, widthMm: number): Promise<StyledResult> {
	libPromise ??= import('@liquid-js/qr-code-styling');
	const lib = await libPromise;

	const gradient =
		opts.gradient === 'none'
			? undefined
			: {
					type: opts.gradient,
					rotation: (opts.gradientAngleDeg * Math.PI) / 180,
					colorStops: [
						{ offset: 0, color: opts.fg },
						{ offset: 1, color: opts.gradientTo }
					]
				};

	const qr = new lib.QRCodeStyling({
		data: opts.payload,
		shape: 'square',
		qrOptions: {
			typeNumber: opts.version as never,
			errorCorrectionLevel: ECC_MAP[opts.ecc] as never
		},
		dotsOptions: { type: DOT_MAP[opts.dot] as never, color: opts.fg, gradient: gradient as never },
		// A chosen corner colour is solid: it stands in for the gradient on the finder patterns.
		cornersSquareOptions: { type: opts.cornerSquare as never, color: opts.cornerColor ?? opts.fg, gradient: (opts.cornerColor ? undefined : gradient) as never },
		cornersDotOptions: { type: opts.cornerDot as never, color: opts.cornerColor ?? opts.fg, gradient: (opts.cornerColor ? undefined : gradient) as never },
		// The library's only quiet-zone control is backgroundOptions.margin, so a transparent
		// background keeps the margin and makes the fill invisible instead of disabling the block.
		backgroundOptions: { color: opts.bg === 'transparent' ? 'rgba(0,0,0,0)' : opts.bg, margin: opts.quietZone },
		image: opts.logo,
		// `center` cuts the modules out from under the logo; `overlay` paints it on top of them
		// and forces the margin to zero. `imageOptions.fill` is not a knockout: the library only
		// reads it in `background` mode, so setting it here did nothing at all.
		imageOptions: {
			mode: opts.logoKnockout ? 'center' : 'overlay',
			imageSize: opts.logoCoefficient,
			margin: opts.logoMargin
		}
	});

	let svg = (await qr.serialize()) ?? '';
	if (!svg) throw new Error('Styled renderer produced no output');
	// The library writes no <title>; the plain renderer and the bulk SVGs do, and a download should not lose its name for being styled.
	if (opts.title) svg = svg.replace(/<svg\b[^>]*>/, (open) => `${open}<title>${escapeXml(opts.title!)}</title>`);
	let scale = 1;
	if (opts.frame.enabled) {
		const framed = frameSvg(svg, opts);
		svg = framed.svg;
		scale = framed.scale;
	}
	svg = setPhysicalSize(svg, widthMm * scale);
	return { svg, size: countModules(svg, opts.version), scale };
}

/**
 * Wrap the code in a rounded frame with a label band underneath. The code keeps its own quiet
 * zone inside; the frame is outside it, so decoding is unaffected. Units are the library's pixels.
 */
export function frameSvg(inner: string, opts: Pick<StyleOptions, 'bg' | 'frame'>): { svg: string; scale: number } {
	const vb = inner.match(/viewBox="([^"]+)"/)?.[1]?.split(/\s+/).map(Number);
	const w = (vb && vb[2]) || Number(inner.match(/\swidth="([\d.]+)"/)?.[1]) || 1000;
	const h = (vb && vb[3]) || w;
	const t = w * FRAME.edge;
	const band = w * FRAME.band;
	const r = w * FRAME.radius;
	const outerW = w + 2 * t;
	const outerH = h + t + band;

	// Drop the XML prologue and the outer size so the code nests as a positioned child.
	let body = inner.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
	body = body.replace(/^<svg([^>]*)>/, (_m, attrs: string) => {
		const kept = attrs.replace(/\s(?:width|height|x|y)="[^"]*"/g, '');
		return `<svg${kept} x="${n(t)}" y="${n(t)}" width="${n(w)}" height="${n(h)}">`;
	});

	const paper = opts.bg === 'transparent' ? '#ffffff' : opts.bg;
	const text = (opts.frame.text || 'Scan me').trim().slice(0, FRAME.maxChars) || 'Scan me';
	// Fit long labels: bold sans runs about 0.6 em per character; keep it inside 90% of the width.
	const fontSize = Math.min(band * 0.52, (outerW * 0.9) / (0.62 * Math.max(4, text.length)));
	const textY = t + h + band / 2 + fontSize * 0.36;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
		`viewBox="0 0 ${n(outerW)} ${n(outerH)}" width="${n(outerW)}" height="${n(outerH)}">` +
		`<rect width="${n(outerW)}" height="${n(outerH)}" rx="${n(r)}" fill="${opts.frame.color}"/>` +
		`<rect x="${n(t)}" y="${n(t)}" width="${n(w)}" height="${n(h)}" fill="${paper}"/>` +
		body +
		`<text x="${n(outerW / 2)}" y="${n(textY)}" text-anchor="middle" ` +
		`font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${n(fontSize)}" ` +
		`fill="${opts.frame.textColor}">${escapeXml(text)}</text>` +
		`</svg>`;
	return { svg, scale: outerW / w };
}

function n(v: number): string {
	return Number(v.toFixed(3)).toString();
}

function setPhysicalSize(svg: string, widthMm: number): string {
	// Ensure a viewBox exists, then set width/height in mm (keeping aspect from viewBox).
	const vb = svg.match(/viewBox="([^"]+)"/);
	const w = svg.match(/\swidth="([\d.]+)"/);
	const h = svg.match(/\sheight="([\d.]+)"/);
	let out = svg;
	if (!vb && w && h) {
		out = out.replace('<svg', `<svg viewBox="0 0 ${w[1]} ${h[1]}"`);
	}
	const parts = (out.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 1 1').split(/\s+/).map(Number);
	const ratio = (parts[3] ?? 1) / (parts[2] ?? 1);
	const mm = Number(widthMm.toFixed(3));
	const hmm = Number((widthMm * ratio).toFixed(3));
	out = out.replace(/\swidth="[^"]*"/, ` width="${mm}mm"`).replace(/\sheight="[^"]*"/, ` height="${hmm}mm"`);
	if (!/\swidth="/.test(out)) out = out.replace('<svg', `<svg width="${mm}mm" height="${hmm}mm"`);
	return out;
}

function countModules(_svg: string, version: number): number {
	// We force typeNumber, so the count is fixed by version. Kept as a function in case the
	// library ever ignores typeNumber; then parse the viewBox against dotsOptions.size.
	return 17 + 4 * version;
}
