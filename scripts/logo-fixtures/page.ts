/**
 * The browser half of `bun run logo-fixtures`.
 *
 * For every fixture: prepare it, assert nothing that can act or reach the network survived,
 * assert it has a real size, then place it in an actual QR code and decode the result. The last
 * step is the one that matters: a logo that sanitises perfectly but cuts a hole in the wrong
 * shape is still a broken feature.
 */
import { prepareSvgLogo, decodeSvgDataUrl, SvgLogoError } from '../../apps/site/src/lib/logo-svg';
import { fitLogo } from '../../apps/site/src/lib/logo-size';
import { renderStyled } from '../../apps/site/src/lib/styled';
import { svgToCanvas, canvasImageData } from '../../apps/site/src/lib/svg-raster';
import { encode, verifyImageData } from '../../apps/site/node_modules/@stoneqr/engine';

const PAYLOAD = 'https://stoneqr.app/logo';
const status = document.getElementById('status')!;
const logEl = document.getElementById('log')!;
const art = document.getElementById('art')!;

let failures = 0;

function line(ok: boolean, text: string): void {
	const p = document.createElement('div');
	p.className = ok ? 'ok' : 'bad';
	p.textContent = `${ok ? 'ok  ' : 'FAIL'} ${text}`;
	logEl.appendChild(p);
	void fetch('/log', { method: 'POST', body: `${ok ? 'ok  ' : 'FAIL'} ${text}` });
	if (!ok) failures++;
}

/** Things that must never appear in prepared markup, whatever the input did. */
const FORBIDDEN: Array<[RegExp, string]> = [
	[/<script/i, 'a script element'],
	[/<foreignObject/i, 'a foreignObject'],
	[/<animate|<set\b/i, 'an animation element'],
	[/\son[a-z]+\s*=/i, 'an event handler attribute'],
	[/(?:href|src)\s*=\s*"(?!#|data:image\/(?:png|jpeg|jpg|gif|webp);)/i, 'a reference off the machine'],
	[/url\(\s*['"]?(?!#|data:image\/)/i, 'a CSS url pointing outside the file'],
	[/@import/i, 'an @import'],
	[/\sclass\s*=/i, 'a class attribute'],
	[/<style[\s>]/i, 'a style element']
];

async function check(name: string): Promise<void> {
	const source = await fetch(`/fixtures/${encodeURIComponent(name)}`).then((r) => r.text());

	let prepared;
	try {
		prepared = prepareSvgLogo(source);
	} catch (e) {
		const why = e instanceof SvgLogoError ? e.message : String(e);
		line(false, `${name}: refused — ${why}`);
		return;
	}

	const markup = decodeSvgDataUrl(prepared.dataUrl);
	for (const [pattern, what] of FORBIDDEN) {
		if (pattern.test(markup)) line(false, `${name}: prepared markup still has ${what}`);
	}
	if (!(prepared.width > 0) || !(prepared.height > 0)) {
		line(false, `${name}: no size (${prepared.width} × ${prepared.height})`);
		return;
	}
	if (!/viewBox="/.test(markup)) line(false, `${name}: no viewBox on the root`);

	// The id the renderer uses for its own dot mask; a logo carrying it must have been renamed.
	if (/id="mask-dot-color"/.test(markup)) line(false, `${name}: an id was left unscoped`);

	// Place it in a real code and decode the result.
	const qr = encode(PAYLOAD, { ecc: 'H', minVersion: 1, mask: 'auto' });
	const aspect = prepared.height / prepared.width;
	const fit = fitLogo(0.2, { modules: qr.size, version: qr.version, ecc: 'H', margin: 1, aspect });
	const rendered = await renderStyled(
		{
			payload: PAYLOAD,
			ecc: 'H',
			version: qr.version,
			quietZone: 4,
			fg: '#111111',
			bg: '#ffffff',
			dot: 'square',
			cornerSquare: 'square',
			cornerDot: 'square',
			gradient: 'none',
			gradientTo: '#000000',
			gradientAngleDeg: 45,
			logo: prepared.dataUrl,
			logoCoefficient: fit.coefficient,
			logoKnockout: true,
			logoMargin: 1,
			frame: { enabled: false, text: '', color: '#000000', textColor: '#ffffff' }
		},
		50
	);

	// The renderer inlines an SVG logo as markup; an <image> means it fell back to a picture.
	const inlined = !/<image[^>]*svg\+xml/i.test(rendered.svg);
	if (!inlined) line(false, `${name}: placed as a raster, so the download would not stay vector`);

	const side = (qr.size + 8) * 10;
	const canvas = await svgToCanvas(rendered.svg, side, '#ffffff');
	const decoded = verifyImageData(canvasImageData(canvas), PAYLOAD);
	if (!decoded.ok) line(false, `${name}: the code did not decode (${decoded.note ?? 'no reason given'})`);

	const shape = aspect > 1.05 ? 'tall' : aspect < 0.95 ? 'wide' : 'square';
	line(
		true,
		`${name}: ${prepared.width} × ${prepared.height} ${shape}, hole ${fit.hideX}×${fit.hideY}, decodes` +
			(prepared.notes.length ? `, ${prepared.notes.length} note${prepared.notes.length === 1 ? '' : 's'}` : '')
	);
	for (const note of prepared.notes) line(true, `      note: ${note}`);

	const fig = document.createElement('figure');
	const img = new Image();
	img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(rendered.svg)))}`;
	const cap = document.createElement('figcaption');
	cap.textContent = name;
	fig.append(img, cap);
	art.appendChild(fig);
}

/** A file that says nothing about its size must still not be guessed at silently. */
async function checkRefusals(): Promise<void> {
	const cases: Array<[string, string]> = [
		['not an SVG at all', '<html><body>hello</body></html>'],
		['malformed markup', '<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>'],
		['nothing drawable', '<svg xmlns="http://www.w3.org/2000/svg"><script>x=1</script></svg>']
	];
	for (const [what, source] of cases) {
		try {
			prepareSvgLogo(source);
			line(false, `refusals: ${what} was accepted`);
		} catch (e) {
			line(e instanceof SvgLogoError, `refusals: ${what} — ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// window.__pwned is set by every handler in the hostile fixture; nothing may have run.
	const pwned = (window as unknown as { __pwned?: string }).__pwned;
	line(pwned === undefined, pwned === undefined ? 'nothing in the fixtures executed' : `something executed: ${pwned}`);
}

async function main(): Promise<void> {
	const names: string[] = await fetch('/fixtures').then((r) => r.json());
	for (const name of names) {
		status.textContent = `Checking ${name}…`;
		try {
			await check(name);
		} catch (e) {
			line(false, `${name}: threw — ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	await checkRefusals();
	status.textContent = failures ? `${failures} failed` : 'All fixtures passed.';
	await fetch('/done', { method: 'POST', body: String(failures) });
}

void main();
