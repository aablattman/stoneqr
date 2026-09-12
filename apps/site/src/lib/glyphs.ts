/**
 * Built-in shapes for Artistic QR's silhouette mode. Each is a small SVG, black on white, that goes
 * through the same path as an uploaded picture (a data URL decoded on a canvas), so it needs no
 * engine support and the vector export embeds it as a vector.
 */
export interface Glyph {
	id: string;
	/** Plain name for the button and the file name. */
	label: string;
	/** SVG body inside a 100 × 100 viewBox: black shapes on the white background the wrapper adds. */
	body: string;
}

export const GLYPHS: readonly Glyph[] = [
	{ id: 'wifi', label: 'WiFi', body: '<circle cx="50" cy="78" r="7"/><path d="M28 60a31 31 0 0 1 44 0" fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"/><path d="M14 45a51 51 0 0 1 72 0" fill="none" stroke="#000" stroke-width="10" stroke-linecap="round"/>' },
	{ id: 'heart', label: 'Heart', body: '<path d="M50 88C20 66 8 52 8 34a19 19 0 0 1 42-11 19 19 0 0 1 42 11c0 18-12 32-42 54z"/>' },
	{ id: 'star', label: 'Star', body: '<polygon points="50.0,6.0 61.8,35.8 93.7,37.8 69.0,58.2 77.0,89.2 50.0,72.0 23.0,89.2 31.0,58.2 6.3,37.8 38.2,35.8"/>' },
	{ id: 'arrow', label: 'Arrow', body: '<path d="M8 40h50V18l34 32-34 32V60H8z"/>' },
	{ id: 'pin', label: 'Map pin', body: '<path d="M50 6a30 30 0 0 0-30 30c0 24 30 58 30 58s30-34 30-58A30 30 0 0 0 50 6zm0 42a12 12 0 1 1 0-24 12 12 0 0 1 0 24z"/>' },
	{ id: 'mail', label: 'Envelope', body: '<path d="M6 22h88v56H6z"/><path d="M8 26l42 30 42-30" fill="none" stroke="#fff" stroke-width="8" stroke-linejoin="round"/>' },
	{ id: 'check', label: 'Tick', body: '<path d="M12 54l24 24 52-56" fill="none" stroke="#000" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' }
];

/** The glyph as a standalone SVG document. `side` sets the intrinsic pixel size a canvas will decode it at. */
export function glyphSvg(g: Glyph, side = 512): string {
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${side}" height="${side}">` +
		`<rect width="100" height="100" fill="#fff"/>${g.body}</svg>`
	);
}

export function glyphDataUrl(g: Glyph, side = 512): string {
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyphSvg(g, side))}`;
}

/** What the picture row calls a built-in shape, so it reads as one rather than as a file. */
export function glyphName(g: Glyph): string {
	return `${g.label} (built-in shape)`;
}
