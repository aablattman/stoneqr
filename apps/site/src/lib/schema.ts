import { SITE } from './site';

/**
 * The schema.org node for the generator itself, added to the home page's JSON-LD graph by
 * `Seo.svelte`. Every page carries WebSite and WebPage nodes; this one tells search engines the
 * site is a free web application rather than an article.
 */
export const APP_SCHEMA: Record<string, unknown> = {
	'@type': 'WebApplication',
	'@id': `${SITE.url}/#app`,
	name: SITE.name,
	url: `${SITE.url}/`,
	description:
		'Free QR code generator that runs entirely in the browser. No sign-up, no expiry, nothing uploaded. Vector SVG, PDF, and EPS exports, a print-size calculator, logos, artistic QR codes, bulk generation, and a decode check before every download.',
	applicationCategory: 'UtilitiesApplication',
	operatingSystem: 'Any',
	browserRequirements: 'Requires JavaScript',
	isAccessibleForFree: true,
	offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
	license: 'https://opensource.org/license/mit',
	sameAs: [SITE.repo],
	featureList: [
		'URL, text, WiFi, vCard, MeCard, email, SMS, phone, calendar event, and location codes',
		'SVG, PDF, EPS, and PNG export with real millimetre dimensions',
		'Print-size and scan-distance calculator',
		'Logo in the middle with clear space, a coverage cap, and automatic error correction',
		'Artistic QR: a photo or shape blended through the whole code',
		'Bulk generation from CSV with Avery label sheets',
		'Decode check before every download'
	]
};
