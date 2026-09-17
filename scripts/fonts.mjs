/**
 * Build the first-paint font files.
 *
 *   bun run fonts
 *
 * The site's two families (Archivo, cut into three first-paint faces, and JetBrains Mono) ship from @fontsource-variable as full variable fonts (about 140 KB
 * for the Latin files), and the browser cannot start fetching them until the stylesheet has
 * arrived and been parsed. This script cuts each family down to what the first paint needs:
 * the basic Latin repertoire (ASCII, Latin-1, the common typographic punctuation) and only the
 * axis ranges the stylesheet uses. Each subset has a family name of its own ('Archivo Text' and so on)
 * and app.css lists the fontsource family after it, so the two never tie in font matching: a face
 * sharing the fontsource family name lost to it whenever both descriptor ranges covered a request.
 * The fontsource faces stay imported in app.css as the fallback
 * for any other character, so a Polish surname in a vCard still renders in the right family; the
 * browser downloads that fuller file only when such a character appears.
 *
 * Outputs (all regenerated; do not edit by hand):
 *   apps/site/static/fonts/<family>.<hash>.woff2   content-hashed, cached immutable by _headers
 *   apps/site/src/lib/fonts.css                     the @font-face rules (imported after fontsource)
 *   apps/site/src/lib/fonts.ts                      the hrefs the layout preloads
 *   apps/site/static/_headers                       a Link: preload header per page, between markers;
 *                                                   Cloudflare sends it as a 103 Early Hint, so the
 *                                                   fonts start before the HTML has arrived
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { OG_ROUTES } from './og/routes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'apps/site/static/fonts');

/** Basic Latin: ASCII, Latin-1 Supplement, and the punctuation the site copy uses. */
const RANGES = [
	[0x20, 0x7e],
	[0xa0, 0xff],
	[0x2013, 0x2014], // en and em dash
	[0x2018, 0x2019], // single quotes
	[0x201c, 0x201d], // double quotes
	[0x2022, 0x2022], // bullet
	[0x2026, 0x2026], // ellipsis
	[0x20ac, 0x20ac], // euro
	[0x2122, 0x2122], // trade mark
	[0x2212, 0x2212] // minus
];
const text = RANGES.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i))).join('');
/** A unicode-range for exactly the characters of a string, for a face cut to a short repertoire. */
const rangeOf = (chars) =>
	[...new Set([...chars].map((c) => c.codePointAt(0)))]
		.sort((a, b) => a - b)
		.map((c) => `U+${c.toString(16)}`)
		.join(', ');
const unicodeRange = RANGES.map(([a, b]) => (a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`)).join(', ');

/**
 * One entry per family. `axes` pins what the stylesheet never varies and narrows what it does;
 * `weight` is the font-weight descriptor the narrowed face advertises.
 */
const FAMILIES = [
	{
		name: 'archivo-text',
		family: 'Archivo Text',
		file: 'archivo/files/archivo-latin-wdth-normal.woff2',
		// Body copy, inputs, and buttons: normal width, 400 to 700.
		axes: { wght: { min: 400, max: 700 }, wdth: 100 },
		weight: '400 700'
	},
	{
		name: 'archivo-display',
		family: 'Archivo Display',
		file: 'archivo/files/archivo-latin-wdth-normal.woff2',
		// Headings, labels, badges, and the wordmark: the expanded end of the width axis, 600 to 800.
		axes: { wght: { min: 600, max: 800 }, wdth: 125 },
		weight: '600 800',
		stretch: '125%'
	},
	{
		name: 'archivo-caption',
		family: 'Archivo Caption',
		file: 'archivo/files/archivo-latin-wdth-normal.woff2',
		// The captions under drawn tiles, set in capitals at 87.5% width so a word fits a 46 px tile.
		// Capitals, digits, and a little punctuation are all they ever show.
		axes: { wght: 600, wdth: 87.5 },
		weight: '600',
		stretch: '87.5%',
		// Preloaded like the others: left to be discovered, it held first paint back by 100 to 350 ms
		// in Lighthouse's throttled run, because the type tiles are in the first screen.
		text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -./&()%\'\u2019'
	},
	{
		name: 'jetbrains-mono',
		family: 'JetBrains Mono Subset',
		file: 'jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
		// Figures only (.num, numeric inputs, hex fields) at 400 and 500.
		axes: { wght: { min: 400, max: 500 } },
		weight: '400 500'
	}
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const faces = [];
const hrefs = [];
for (const f of FAMILIES) {
	const input = readFileSync(fileURLToPath(import.meta.resolve(`@fontsource-variable/${f.file}`)));
	const out = await subsetFont(input, f.text ?? text, { targetFormat: 'woff2', variationAxes: f.axes });
	const hash = createHash('sha256').update(out).digest('hex').slice(0, 8);
	const name = `${f.name}.${hash}.woff2`;
	writeFileSync(resolve(outDir, name), out);
	hrefs.push(`/fonts/${name}`);
	faces.push(
		`@font-face {\n\tfont-family: '${f.family}';\n\tfont-style: normal;\n\tfont-weight: ${f.weight};\n${f.stretch ? `\tfont-stretch: ${f.stretch};\n` : ''}\tfont-display: swap;\n\tsrc: url('/fonts/${name}') format('woff2-variations');\n\tunicode-range: ${f.text ? rangeOf(f.text) : unicodeRange};\n}`
	);
	console.log(`${name}\t${input.length} -> ${out.length} B`);
}

const banner = '/* Generated by scripts/fonts.mjs (bun run fonts). Do not edit. */\n';
writeFileSync(
	resolve(root, 'apps/site/src/lib/fonts.css'),
	banner +
		'/* Declared after the @fontsource-variable imports, so these faces win for the basic Latin range\n   and the fuller fontsource files are fetched only for characters outside it. */\n' +
		faces.join('\n') +
		'\n'
);
writeFileSync(
	resolve(root, 'apps/site/src/lib/fonts.ts'),
	'// Generated by scripts/fonts.mjs (bun run fonts). Do not edit.\n/** First-paint font files, preloaded by the layout so they load alongside the stylesheet. */\nexport const FONT_PRELOADS = ' +
		JSON.stringify(hrefs, null, '\t') +
		' as const;\n'
);

// Early Hints: one Link header per page (not /*, which would stamp it on every image too).
const headersPath = resolve(root, 'apps/site/static/_headers');
const BEGIN = '# BEGIN fonts (generated by scripts/fonts.mjs)';
const END = '# END fonts';
const link = hrefs.map((h) => `<${h}>; rel=preload; as=font; crossorigin`).join(', ');
const block = ['/', ...OG_ROUTES.map((r) => r.path)].map((path) => `${path}\n  Link: ${link}`).join('\n');
const headers = readFileSync(headersPath, 'utf8');
const start = headers.indexOf(BEGIN);
const end = headers.indexOf(END);
const generated = `${BEGIN}\n${block}\n${END}`;
const next = start === -1 ? `${headers.trimEnd()}\n\n${generated}\n` : headers.slice(0, start) + generated + headers.slice(end + END.length);
writeFileSync(headersPath, next);
console.log(readdirSync(outDir).join(' '));
