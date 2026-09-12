/**
 * The browser half of `bun run logo-fixtures`.
 *
 * For every fixture: prepare it, assert nothing that can act or reach the network survived,
 * assert it has a real size, then place it in an actual QR code and decode the result. The last
 * step is the one that matters: a logo that sanitises perfectly but cuts a hole in the wrong
 * shape is still a broken feature.
 */
import { prepareSvgLogo, decodeSvgDataUrl, cropSvgDataUrl, SvgLogoError } from '../../apps/site/src/lib/logo-svg';
import { cropAspect, cropLogo } from '../../apps/site/src/lib/logo-crop';
import type { CropRect } from '../../apps/site/src/lib/crop';
import { fitLogo, LOGO_WIDTH_MAX } from '../../apps/site/src/lib/logo-size';
import { LOGO_ICONS, logoIconDataUrl, logoIconSvg } from '../../apps/site/src/lib/logo-icons';
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

/**
 * Prepare one logo, check what came out, place it in a real code at `width`, and decode it.
 * `clean` is for our own drawings: the preparation must find nothing to change in them.
 */
async function check(name: string, source: string, width = 0.2, clean = false, placed?: string): Promise<void> {

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
	const fit = fitLogo(width, { modules: qr.size, version: qr.version, ecc: 'H', margin: 1, aspect });
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
			// An icon goes into the code as the Logo panel puts it there, unprepared.
			logo: placed ?? prepared.dataUrl,
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
		`${name}: ${prepared.width} × ${prepared.height} ${shape}, hole ${fit.hideX}×${fit.hideY} at ${Math.round(width * 100)}%, decodes` +
			(prepared.notes.length ? `, ${prepared.notes.length} note${prepared.notes.length === 1 ? '' : 's'}` : '')
	);
	for (const note of prepared.notes) line(!clean, `      note: ${note}`);

	const fig = document.createElement('figure');
	const img = new Image();
	img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(rendered.svg)))}`;
	const cap = document.createElement('figcaption');
	cap.textContent = name;
	fig.append(img, cap);
	art.appendChild(fig);
}

/**
 * A prepared logo cut down through the crop box's vector path, placed and decoded. The wrapper
 * must be what the renderer inlines (a picture would lose the vector), the hole must be cut for
 * the crop's shape rather than the file's, and nothing outside the crop may be drawn.
 */
async function checkCropped(name: string, source: string, crop: CropRect, expectSquare: boolean): Promise<void> {
	const prepared = prepareSvgLogo(source);
	const url = await cropLogo(prepared.dataUrl, crop);
	const viaString = cropSvgDataUrl(prepared.dataUrl, crop);
	if (url !== viaString) line(false, `${name}: cropLogo did not take the vector path for an SVG`);
	const markup = decodeSvgDataUrl(url);
	if (!/^<svg [^>]*viewBox="[^"]+" width="[^"]+" height="[^"]+"><clipPath id="lgcrop">/.test(markup)) {
		line(false, `${name}: the crop wrapper is not the expected shape: ${markup.slice(0, 120)}`);
	}
	const measured = await new Promise<{ w: number; h: number }>((res, rej) => {
		const img = new Image();
		img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
		img.onerror = () => rej(new Error('the cropped SVG did not load as a picture'));
		img.src = url;
	});
	const aspect = cropAspect(crop, prepared.height / prepared.width);
	if (Math.abs(measured.h / measured.w - aspect) > 0.02) {
		line(false, `${name}: the browser measures the crop as ${measured.w}×${measured.h}, not the ${aspect.toFixed(3)} the hole is cut for`);
	}
	const qr = encode(PAYLOAD, { ecc: 'H', minVersion: 1, mask: 'auto' });
	const fit = fitLogo(0.2, { modules: qr.size, version: qr.version, ecc: 'H', margin: 1, aspect });
	if (expectSquare && fit.hideX !== fit.hideY) line(false, `${name}: a square crop got a ${fit.hideX}×${fit.hideY} hole`);
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
			logo: url,
			logoCoefficient: fit.coefficient,
			logoKnockout: true,
			logoMargin: 1,
			frame: { enabled: false, text: '', color: '#000000', textColor: '#ffffff' }
		},
		50
	);
	if (/<image[^>]*svg\+xml/i.test(rendered.svg)) line(false, `${name}: the cropped logo was placed as a raster`);
	if (!/clip-path="url\(#lgcrop\)"/.test(rendered.svg)) line(false, `${name}: the crop clip did not survive into the code`);
	const side = (qr.size + 8) * 10;
	const canvas = await svgToCanvas(rendered.svg, side, '#ffffff');
	const decoded = verifyImageData(canvasImageData(canvas), PAYLOAD);
	if (!decoded.ok) line(false, `${name}: the code did not decode (${decoded.note ?? 'no reason given'})`);
	line(true, `${name}: crop ${crop.w}×${crop.h} at (${crop.u}, ${crop.v}), measured ${measured.w}×${measured.h}, hole ${fit.hideX}×${fit.hideY}, decodes`);

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
			const source = await fetch(`/fixtures/${encodeURIComponent(name)}`).then((r) => r.text());
			await check(name, source);
		} catch (e) {
			line(false, `${name}: threw — ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	// The built-in logo icons, at the default width and the widest the slider allows, in a
	// coloured ink. They are our drawings, so preparation must leave them exactly as they are.
	for (const icon of LOGO_ICONS) {
		for (const width of [0.2, LOGO_WIDTH_MAX]) {
			const name = `icon ${icon.id}`;
			status.textContent = `Checking ${name}…`;
			try {
				await check(name, logoIconSvg(icon, '#1a3d8f'), width, true, logoIconDataUrl(icon, '#1a3d8f'));
			} catch (e) {
				line(false, `${name}: threw — ${e instanceof Error ? e.message : String(e)}`);
			}
		}
	}
	// The crop box's vector path: a wordmark cut to a square around its mark, and a clipped-id
	// fixture cut off-centre, so a logo carrying its own clip cannot break the wrapper's.
	for (const [name, crop, square] of [
		['wordmark.svg cropped to its mark', { u: 0.075, v: 0.125, w: 0.1875, h: 0.75 }, true],
		['figma-clip-ids.svg cropped off-centre', { u: 0.3, v: 0.1, w: 0.6, h: 0.5 }, false]
	] as const) {
		status.textContent = `Checking ${name}…`;
		try {
			const file = name.split(' ')[0]!;
			const source = await fetch(`/fixtures/${encodeURIComponent(file)}`).then((r) => r.text());
			await checkCropped(name, source, crop, square);
		} catch (e) {
			line(false, `${name}: threw — ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	await checkRefusals();
	status.textContent = failures ? `${failures} failed` : 'All fixtures passed.';
	await fetch('/done', { method: 'POST', body: String(failures) });
}

void main();
