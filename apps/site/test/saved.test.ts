import { describe, expect, it } from 'vitest';
import { suggestName, tidyName, toFile, fromFile, newId, FILE_SUFFIX } from '$lib/generator/saved';
import { defaultFields } from '$lib/generator/state.svelte';
import type { Saved } from '$lib/generator/persist';
import { GLYPHS, glyphDataUrl, glyphName } from '$lib/glyphs';
import { LOGO_ICONS, logoIconDataUrl, logoIconName } from '$lib/logo-icons';

const record: Saved = { v: 1, fg: '#123456', fields: { url: { url: 'https://example.com/menu' } } };

describe('saved designs', () => {
	it('suggests a name from what was typed', () => {
		const f = defaultFields();
		expect(suggestName('url', f)).toBe('Website');
		f.url.url = 'https://www.example.com/menu';
		expect(suggestName('url', f)).toBe('example.com/menu');
		f.url.url = 'example.com';
		expect(suggestName('url', f)).toBe('example.com');
		f.wifi.ssid = ' Cafe Corner ';
		expect(suggestName('wifi', f)).toBe('Cafe Corner WiFi');
		expect(suggestName('vcard', f)).toBe('Contact');
		f.vcard.firstName = 'Ada';
		f.vcard.lastName = 'Lovelace';
		expect(suggestName('vcard', f)).toBe('Ada Lovelace');
		f.mecard.org = 'Analytical Engines';
		expect(suggestName('mecard', f)).toBe('Analytical Engines');
		f.text.text = '  Table   4\nplease  ';
		expect(suggestName('text', f)).toBe('Table 4 please');
		f.event.summary = 'Launch party';
		expect(suggestName('event', f)).toBe('Launch party');
		f.geo.lat = '51.5';
		f.geo.lng = '-0.1';
		expect(suggestName('geo', f)).toBe('51.5, -0.1');
	});

	it('tidies names to one trimmed line of bounded length', () => {
		expect(tidyName('  a \n b  ')).toBe('a b');
		expect(tidyName('x'.repeat(500))).toHaveLength(120);
		expect(tidyName('   ')).toBe('');
	});

	it('writes a file that reads back, pictures included', () => {
		const text = toFile({ name: 'Menu', type: 'url', record }, { logo: 'data:image/png;base64,AAAA' });
		const parsed = JSON.parse(text);
		expect(parsed.stoneqr).toBe(1);
		expect('halftone' in parsed).toBe(false);
		const back = fromFile(text);
		expect(back).toEqual({ stoneqr: 1, name: 'Menu', type: 'url', record, logo: 'data:image/png;base64,AAAA', notes: [] });
		expect(FILE_SUFFIX).toBe('.stoneqr.json');
	});

	it('refuses files that are not ours and drops pictures that are not images', () => {
		expect(fromFile('not json')).toBeNull();
		expect(fromFile('{"v":1}')).toBeNull();
		expect(fromFile(JSON.stringify({ stoneqr: 1, record: { v: 2 } }))).toBeNull();
		const loose = fromFile(JSON.stringify({ stoneqr: 1, type: 'bogus', record: { v: 1 }, logo: 'javascript:alert(1)', halftone: 'data:image/jpeg;base64,BBBB' }));
		expect(loose).toEqual({
			stoneqr: 1, name: 'Website', type: 'url', record: { v: 1 }, halftone: 'data:image/jpeg;base64,BBBB',
			notes: ['The logo in that file was left out. Use a PNG, JPEG, WebP, or SVG file.']
		});
	});

	it('holds a file to the upload tiles\' limits and says what it left out', () => {
		const big = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024);
		const opened = fromFile(JSON.stringify({ stoneqr: 1, record: { v: 1 }, logo: big, halftone: 'data:image/tiff;base64,CCCC' }));
		expect(opened?.logo).toBeUndefined();
		expect(opened?.halftone).toBeUndefined();
		expect(opened?.notes).toEqual([
			'The logo in that file was left out. Keep the logo under 2 MB. It only needs to be a few hundred pixels.',
			'The Artistic QR picture in that file was left out. Use a PNG, JPEG, or WebP. Artistic QR works from real pixels; an SVG goes in the Logo panel instead.'
		]);
		// The same 3 MB is fine where the tile allows 8.
		expect(fromFile(JSON.stringify({ stoneqr: 1, record: { v: 1 }, halftone: big }))?.halftone).toBe(big);
	});

	it('rebuilds a built-in shape from its name rather than taking the SVG in the file', () => {
		const star = GLYPHS.find((g) => g.id === 'star')!;
		const record: Saved = { v: 1, halftone: true, halftoneImageName: glyphName(star) };
		// An SVG in the Artistic QR slot is refused as markup, but the shape is restored from glyphs.ts.
		const opened = fromFile(JSON.stringify({ stoneqr: 1, record, halftone: 'data:image/svg+xml;base64,PHN2Zy8+' }));
		expect(opened?.halftone).toBe(glyphDataUrl(star));
		expect(opened?.notes).toEqual([]);
		// And a file that never carried the picture at all gets it back the same way.
		expect(fromFile(JSON.stringify({ stoneqr: 1, record }))?.halftone).toBe(glyphDataUrl(star));
	});

	it('rebuilds a built-in logo icon from its name, in the record\'s code colour', () => {
		const wifi = LOGO_ICONS.find((i) => i.id === 'wifi')!;
		const record: Saved = { v: 1, fg: '#1a3d8f', logoName: logoIconName(wifi) };
		// Whatever markup the file carries in the logo slot is ignored for an icon.
		const opened = fromFile(JSON.stringify({ stoneqr: 1, record, logo: 'data:image/svg+xml;base64,PHN2Zy8+' }));
		expect(opened?.logo).toBe(logoIconDataUrl(wifi, '#1a3d8f'));
		expect(opened?.notes).toEqual([]);
		expect(fromFile(JSON.stringify({ stoneqr: 1, record }))?.logo).toBe(logoIconDataUrl(wifi, '#1a3d8f'));
	});

	it('makes distinct ids', () => {
		expect(newId()).not.toBe(newId());
	});
});
