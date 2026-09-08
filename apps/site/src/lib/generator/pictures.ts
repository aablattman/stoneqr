/**
 * What each picture slot accepts, in one place, so the upload tiles and a `.stoneqr.json`
 * design file apply the same limits. A design file comes off the disk like an upload does, and
 * before 2026-09-06 it could carry a 24 MB TIFF past tiles that refuse anything over a few MB.
 */
export type PictureSlot = 'logo' | 'halftone';

interface PictureRule {
	/** Largest file, in bytes. */
	maxBytes: number;
	/** MIME types the slot takes. */
	types: readonly string[];
	/** Said when the type is wrong. */
	wrongType: string;
	/** Said when the file is too big. */
	tooBig: string;
}

export const PICTURE_RULES: Record<PictureSlot, PictureRule> = {
	logo: {
		maxBytes: 2 * 1024 * 1024,
		types: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
		wrongType: 'Use a PNG, JPEG, WebP, or SVG file.',
		tooBig: 'Keep the logo under 2 MB. It only needs to be a few hundred pixels.'
	},
	halftone: {
		maxBytes: 8 * 1024 * 1024,
		types: ['image/png', 'image/jpeg', 'image/webp'],
		wrongType: 'Use a PNG, JPEG, or WebP. Photo QR resamples real pixels; an SVG goes on the logo instead.',
		tooBig: 'Keep the picture under 8 MB. It is scaled down before it is used anyway.'
	}
};

/** True for the logo slot's SVG: the browser may leave `type` empty for a dropped `.svg`, so the name counts too. */
export function isSvgFile(file: { name: string; type: string }): boolean {
	return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
}

/** Why a dropped or chosen file cannot go in the slot, or null when it can. */
export function pictureFileProblem(slot: PictureSlot, file: { name: string; type: string; size: number }): string | null {
	const rule = PICTURE_RULES[slot];
	const type = slot === 'logo' && isSvgFile(file) ? 'image/svg+xml' : file.type;
	if (!rule.types.includes(type)) return rule.wrongType;
	if (file.size > rule.maxBytes) return rule.tooBig;
	return null;
}

/** The MIME type a data URL declares, lower-cased, or '' when it is not a data URL. */
export function dataUrlType(url: string): string {
	const m = /^data:([^;,]*)/i.exec(url);
	return m ? m[1]!.toLowerCase() : '';
}

/** The decoded size of a data URL's payload, in bytes: base64 carries three bytes in four characters. */
export function dataUrlBytes(url: string): number {
	const comma = url.indexOf(',');
	if (comma < 0) return url.length;
	const body = url.length - comma - 1;
	return /;base64/i.test(url.slice(0, comma)) ? Math.floor((body * 3) / 4) : body;
}

/** The same rules as `pictureFileProblem`, for a picture that arrives as a data URL in a design file. */
export function dataUrlProblem(slot: PictureSlot, url: string): string | null {
	const rule = PICTURE_RULES[slot];
	if (!url.startsWith('data:')) return rule.wrongType;
	if (!rule.types.includes(dataUrlType(url))) return rule.wrongType;
	if (dataUrlBytes(url) > rule.maxBytes) return rule.tooBig;
	return null;
}
