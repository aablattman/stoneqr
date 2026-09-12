import { describe, expect, it } from 'vitest';
import { LOGO_ICONS, logoIconArt, logoIconByName, logoIconDataUrl, logoIconName, logoIconSvg } from '$lib/logo-icons';
import { GLYPHS } from '$lib/glyphs';

describe('built-in logo icons', () => {
	it('have unique ids and labels, and find themselves again by name', () => {
		expect(new Set(LOGO_ICONS.map((i) => i.id)).size).toBe(LOGO_ICONS.length);
		expect(new Set(LOGO_ICONS.map((i) => i.label)).size).toBe(LOGO_ICONS.length);
		for (const icon of LOGO_ICONS) expect(logoIconByName(logoIconName(icon))).toBe(icon);
	});

	it('never match an uploaded file or an Artistic QR shape by name', () => {
		expect(logoIconByName('')).toBeUndefined();
		expect(logoIconByName(undefined)).toBeUndefined();
		expect(logoIconByName('wifi.png')).toBeUndefined();
		expect(logoIconByName('WiFi (built-in shape)')).toBeUndefined();
		// The shape tiles and the icon tiles must not share a name, or a design file could restore one as the other.
		for (const g of GLYPHS) expect(logoIconByName(`${g.label} (built-in shape)`)).toBeUndefined();
	});

	it('draw in the colour given, as ink only, square, with a viewBox', () => {
		for (const icon of LOGO_ICONS) {
			const svg = logoIconSvg(icon, '#1A3D8F');
			expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100" width="256" height="256"/);
			expect(svg).not.toContain('INK');
			// No paper of their own: the hole the logo cuts is the code's background.
			expect(svg).not.toMatch(/#fff|white|<rect width="100" height="100"/i);
			expect(svg.match(/#[0-9a-f]{3,6}\b/gi)?.every((c) => c === '#1a3d8f')).toBe(true);
			// Nothing that would need scoping or sanitising.
			expect(svg).not.toMatch(/\sid=|href|<script|<style|\son\w+=/i);
		}
	});

	it('refuse a colour that is not a plain hex rather than write it into markup', () => {
		const svg = logoIconSvg(LOGO_ICONS[0]!, '"/><script>alert(1)</script>');
		expect(svg).not.toContain('script');
		expect(svg).toContain('fill="#000000"');
	});

	it('round-trip through a data URL, and the tile art follows the page ink', () => {
		const icon = LOGO_ICONS[1]!;
		const url = logoIconDataUrl(icon, '#000000');
		// The renderer inlines only a base64 SVG as markup; any other form would be placed as a picture.
		expect(url.startsWith('data:image/svg+xml;base64,')).toBe(true);
		expect(atob(url.slice(url.indexOf(',') + 1))).toBe(logoIconSvg(icon, '#000000'));
		expect(logoIconArt(icon)).not.toMatch(/INK|#[0-9a-f]{6}/i);
	});
});
