/**
 * Built-in icons for the centre logo, for anyone who has no logo file to hand: a WiFi sign, a
 * menu, a contact card. Generic marks only, drawn here, never a brand's logo.
 *
 * They are not the Artistic QR shapes in `glyphs.ts`. Those are silhouettes, black on a white
 * square, because the halftone renderer reads them as a picture. These sit in the hole a logo
 * cuts, on whatever background the code has, so they are ink only (no paper of their own) and
 * drawn in the code colour, which the Logo panel keeps them following.
 *
 * An icon is a name, not a picture: a design record or a share link carries `logoName`, and the
 * picture is rebuilt from it here, so an icon survives where an uploaded logo cannot travel.
 */
export interface LogoIcon {
	id: string;
	/** Plain name, for the button's label and the logo's name. */
	label: string;
	/** SVG body inside a 100 × 100 viewBox. `INK` stands for the colour; filled shapes inherit it from the root. */
	body: string;
}

const S = 'fill="none" stroke="INK" stroke-linecap="round" stroke-linejoin="round"';

export const LOGO_ICONS: readonly LogoIcon[] = [
	{
		id: 'web',
		label: 'Website',
		body: `<circle cx="50" cy="50" r="40" ${S} stroke-width="9"/><ellipse cx="50" cy="50" rx="16" ry="40" ${S} stroke-width="8"/><path d="M11 50h78" ${S} stroke-width="8"/>`
	},
	{
		id: 'wifi',
		label: 'WiFi',
		body: `<circle cx="50" cy="80" r="8"/><path d="M29 60a30 30 0 0 1 42 0" ${S} stroke-width="11"/><path d="M12 42a54 54 0 0 1 76 0" ${S} stroke-width="11"/>`
	},
	{
		id: 'mail',
		label: 'Email',
		body: `<rect x="8" y="20" width="84" height="60" rx="8" ${S} stroke-width="9"/><path d="M14 28l36 26 36-26" ${S} stroke-width="9"/>`
	},
	{
		id: 'phone',
		label: 'Phone',
		body: `<rect x="26" y="6" width="48" height="88" rx="10" ${S} stroke-width="9"/><path d="M43 19h14" ${S} stroke-width="6"/><circle cx="50" cy="78" r="6"/>`
	},
	{
		id: 'chat',
		label: 'Text message',
		body: `<path d="M18 12h64a10 10 0 0 1 10 10v40a10 10 0 0 1-10 10H46L26 90V72h-8A10 10 0 0 1 8 62V22a10 10 0 0 1 10-10z" ${S} stroke-width="9"/><circle cx="32" cy="42" r="6"/><circle cx="50" cy="42" r="6"/><circle cx="68" cy="42" r="6"/>`
	},
	{
		id: 'calendar',
		label: 'Calendar',
		body: `<rect x="10" y="16" width="80" height="76" rx="9" ${S} stroke-width="9"/><path d="M10 38h80M32 6v18M68 6v18" ${S} stroke-width="9"/><rect x="24" y="50" width="14" height="12" rx="2"/><rect x="43" y="50" width="14" height="12" rx="2"/><rect x="62" y="50" width="14" height="12" rx="2"/><rect x="24" y="68" width="14" height="12" rx="2"/><rect x="43" y="68" width="14" height="12" rx="2"/>`
	},
	{
		id: 'contact',
		label: 'Contact',
		body: '<circle cx="50" cy="30" r="21"/><path d="M10 94v-4c0-20 18-34 40-34s40 14 40 34v4z"/>'
	},
	{
		id: 'pin',
		label: 'Location',
		body: '<path fill-rule="evenodd" d="M50 4a33 33 0 0 0-33 33c0 26 33 59 33 59s33-33 33-59A33 33 0 0 0 50 4zm0 47a14 14 0 1 1 0-28 14 14 0 0 1 0 28z"/>'
	},
	{
		id: 'document',
		label: 'Document',
		body: `<path d="M24 6h36l22 22v60a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z" ${S} stroke-width="9"/><path d="M58 8v22h22M34 54h32M34 72h32" ${S} stroke-width="9"/>`
	},
	{
		id: 'menu',
		label: 'Menu',
		body: `<path d="M20 8v26a13 13 0 0 0 26 0V8M33 8v26M33 46v44" ${S} stroke-width="9"/><path d="M82 6C68 10 60 26 60 44v16h12v30a5 5 0 0 0 10 0z"/>`
	},
	{
		id: 'video',
		label: 'Video',
		body: `<circle cx="50" cy="50" r="41" ${S} stroke-width="9"/><path d="M40 30v40l32-20z" stroke="INK" stroke-width="4" stroke-linejoin="round"/>`
	},
	{
		id: 'star',
		label: 'Review',
		body: '<polygon stroke="INK" stroke-width="4" stroke-linejoin="round" points="50.0,6.0 61.8,35.8 93.7,37.8 69.0,58.2 77.0,89.2 50.0,72.0 23.0,89.2 31.0,58.2 6.3,37.8 38.2,35.8"/>'
	}
];

/** A colour that is safe to write into markup; anything else draws black. */
function ink(colour: string): string {
	return /^#[0-9a-f]{6}$/i.test(colour) ? colour.toLowerCase() : '#000000';
}

/** The icon as a standalone SVG document in one colour. `side` sets the intrinsic size. */
export function logoIconSvg(icon: LogoIcon, colour: string, side = 256): string {
	const c = ink(colour);
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${side}" height="${side}" fill="${c}">` +
		`${icon.body.replaceAll('INK', c)}</svg>`
	);
}

/**
 * Base64, never percent-encoded: the renderer inlines only the base64 form as markup, and places
 * anything else as an `<image>`, which would not stay vector in the SVG download. The markup is
 * ASCII, so plain `btoa` is safe.
 */
export function logoIconDataUrl(icon: LogoIcon, colour: string): string {
	return `data:image/svg+xml;base64,${btoa(logoIconSvg(icon, colour))}`;
}

/** What the logo row calls an icon, so it reads as one rather than as a file, and so it can be found again by name. */
export function logoIconName(icon: LogoIcon): string {
	return `${icon.label} (built-in icon)`;
}

/** The icon a logo name refers to, if it is one. File names always carry an extension, so an upload never matches. */
export function logoIconByName(name: string | undefined): LogoIcon | undefined {
	return name ? LOGO_ICONS.find((i) => logoIconName(i) === name) : undefined;
}

/** The icon for a picker tile, in the page's ink through `currentColor`. Never used as the logo itself. */
export function logoIconArt(icon: LogoIcon): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">${icon.body.replaceAll('INK', 'currentColor')}</svg>`;
}
