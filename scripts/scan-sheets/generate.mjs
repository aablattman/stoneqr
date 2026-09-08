/**
 * Build the scan-matrix test sheets: one PDF with every code the tables in docs/scan-matrix.md
 * ask for, each labelled with its row ID, plus a page of deliberately risky codes and a score
 * sheet to pencil results on.
 *
 *   bun run scan-sheets                 # then open the URL it prints (any browser); it writes and exits
 *   bun run scan-sheets -- --photo ~/Pictures/some.jpg   # use a real photo for the Photo QR rows
 *
 * Why a browser: the styled codes come from @liquid-js/qr-code-styling, which needs a DOM to
 * serialise its SVG, and Photo QR needs a decoded picture, which needs a canvas. Same pattern as
 * `bun run og`. Bun bundles page.ts on the fly; the page renders every code, decode-checks it,
 * builds the PDF with pdf-lib, and POSTs it back here.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const out = resolve(root, 'docs/scan-sheets.pdf');
const PORT = 5198;

const photoArg = process.argv.indexOf('--photo');
const photoPath = photoArg > -1 ? resolve(process.argv[photoArg + 1] ?? '') : null;
if (photoPath && !existsSync(photoPath)) {
	console.error(`No such photo: ${photoPath}`);
	process.exit(1);
}
const PHOTO_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const bundle = await Bun.build({
	entrypoints: [resolve(here, 'page.ts')],
	target: 'browser',
	format: 'esm',
	minify: false
});
if (!bundle.success) {
	for (const log of bundle.logs) console.error(log);
	process.exit(1);
}
const pageJs = await bundle.outputs[0].text();

let finish;
let problems = 0;
const done = new Promise((r) => (finish = r));
const file = (path, type) => new Response(readFileSync(path), { headers: { 'content-type': type } });

const server = Bun.serve({
	port: PORT,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === '/') return file(resolve(here, 'page.html'), 'text/html; charset=utf-8');
		if (url.pathname === '/page.js') return new Response(pageJs, { headers: { 'content-type': 'text/javascript' } });
		if (url.pathname === '/scan-matrix.md') return file(resolve(root, 'docs/scan-matrix.md'), 'text/plain; charset=utf-8');
		if (url.pathname === '/favicon.svg') return file(resolve(root, 'apps/site/static/favicon.svg'), 'image/svg+xml');
		// The SVG-logo rows use the same fixtures `bun run logo-fixtures` checks, so the sheet and
		// the test are drawing the same files.
		if (url.pathname.startsWith('/logo-fixture/')) {
			const name = decodeURIComponent(url.pathname.slice('/logo-fixture/'.length));
			if (!/^[a-z0-9-]+\.svg$/i.test(name)) return new Response('not found', { status: 404 });
			return file(resolve(root, 'apps/site/test/fixtures/logos', name), 'image/svg+xml');
		}
		if (url.pathname === '/photo') {
			if (!photoPath) return new Response('no photo given', { status: 404 });
			return file(photoPath, PHOTO_TYPES[extname(photoPath).toLowerCase()] ?? 'application/octet-stream');
		}
		if (request.method === 'POST' && url.pathname === '/save') {
			const bytes = new Uint8Array(await request.arrayBuffer());
			writeFileSync(out, bytes);
			console.log(`  ${(bytes.length / 1024).toFixed(0)} KB  docs/scan-sheets.pdf`);
			problems =
				Number(request.headers.get('x-decode-failures') ?? 0) + Number(request.headers.get('x-matrix-drift') ?? 0);
			finish();
			return new Response('ok');
		}
		if (request.method === 'POST' && url.pathname === '/log') {
			console.log('  ' + (await request.text()));
			return new Response('ok');
		}
		return new Response('not found', { status: 404 });
	}
});

console.log(`Open http://localhost:${PORT}/ to build docs/scan-sheets.pdf${photoPath ? ` (photo: ${photoPath})` : ' (synthetic photo; pass --photo <file> for a real one)'}`);
await done;
server.stop(true);
if (problems) {
	console.error(`Done, but ${problems} thing${problems === 1 ? '' : 's'} above need attention.`);
	process.exit(1);
}
console.log('Done.');
