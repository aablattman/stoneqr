/**
 * One Open Graph card per route. Headlines are the page's own h1 so a shared link says the
 * same thing as the page it opens; the sub line is the meta description, cut to two lines.
 * `/` is HOME_CARD, drawn to apps/site/static/og.png rather than og/, and kept out of this list
 * because the list is also the sitemap's and the fonts' route list.
 */
export const HOME_CARD = {
	slug: '',
	path: '',
	headline: 'QR codes\nset in stone.',
	sub: 'Generated in your browser, never uploaded, never expire.',
	kicker: 'FREE · OPEN SOURCE · NO ACCOUNT · STONEQR.APP'
};

export const OG_ROUTES = [
	{
		slug: 'never-expires',
		path: '/never-expires',
		headline: 'A QR code we never had cannot be switched off.',
		sub: 'Computed on your device and never sent to a server. No trial timer, no deactivation.',
		kicker: 'NEVER EXPIRES · STONEQR.APP'
	},
	{
		slug: 'wifi',
		path: '/wifi',
		headline: 'Share your WiFi without spelling out the password.',
		sub: 'Guests point a camera and join. The password is encoded in your browser and never uploaded.',
		kicker: 'WIFI QR CODE · FREE · NO SIGN-UP'
	},
	{
		slug: 'vcard',
		path: '/vcard',
		headline: 'A contact card people can save in one tap.',
		sub: 'vCard or MeCard for a business card, a badge, or an email signature. No account, no expiry.',
		kicker: 'VCARD QR CODE · FREE · NO SIGN-UP'
	},
	{
		slug: 'event',
		path: '/event',
		headline: 'Add an event to the calendar with one scan.',
		sub: 'A calendar event in a code, with honest notes about which phones actually offer to add it.',
		kicker: 'EVENT QR CODE · FREE · NO SIGN-UP'
	},
	{
		slug: 'logo',
		path: '/logo',
		headline: 'A logo in the middle, and it still scans.',
		sub: 'Error correction raised automatically, the size capped, and every download decode-checked.',
		kicker: 'QR CODE WITH LOGO · FREE · NO SIGN-UP'
	},
	{
		slug: 'photo',
		path: '/photo',
		headline: 'A photo woven through the code, and it still scans.',
		sub: 'A photo or a built-in shape drawn in the modules themselves, decode-checked before download.',
		kicker: 'ARTISTIC QR CODE · FREE · NO SIGN-UP'
	},
	{
		slug: 'bulk',
		path: '/bulk',
		headline: 'Hundreds of codes, one download.',
		sub: 'Paste a list or open a CSV. Every code is decode-tested, then packed into a ZIP or an Avery sheet.',
		kicker: 'BULK QR CODES · AVERY LABELS · STONEQR.APP'
	},
	{
		slug: 'print-size',
		path: '/print-size',
		headline: 'How big should this QR code be?',
		sub: 'Enter a print width or a scan distance and read the module size, the minimum width, and the warnings.',
		kicker: 'QR CODE SIZE CALCULATOR · STONEQR.APP'
	},
	{
		slug: 'compare',
		path: '/compare',
		headline: 'What the free tier actually gives you.',
		sub: 'Expiry, sign-up, vector export, error correction, and where your data goes, side by side.',
		kicker: 'COMPARE QR GENERATORS · STONEQR.APP'
	},
	{
		slug: 'open-source',
		path: '/open-source',
		headline: 'The whole thing is public, engine included.',
		sub: 'MIT licensed. Read the code and check for yourself that nothing you type leaves the browser.',
		kicker: 'OPEN SOURCE · MIT · STONEQR.APP'
	},
	{
		slug: 'privacy',
		path: '/privacy',
		headline: 'Two paragraphs.',
		sub: 'What you type never leaves your browser, and the only analytics are cookie-free page counts.',
		kicker: 'PRIVACY · STONEQR.APP'
	}
];
