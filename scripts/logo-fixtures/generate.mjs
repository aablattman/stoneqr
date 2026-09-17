/**
 * Check that every SVG logo fixture survives `prepareSvgLogo` and comes out safe.
 *
 *   bun run logo-fixtures              # then open the URL it prints; it reports and exits
 *   bun run logo-fixtures --headless   # the same, driven in headless Chrome (what CI runs)
 *
 * Why a browser: the preparation is deliberately built on the DOM parser, the selector engine,
 * and layout, because a hand-rolled sanitiser on strings is how these things go wrong. That has
 * no home in vitest (no jsdom here, by rule), so the fixtures are checked where the code runs.
 * Same shape as `bun run og` and `bun run scan-sheets`.
 *
 * The page also renders each prepared logo into a real QR code and decodes it, so a fixture that
 * sanitises cleanly but breaks the code still fails.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { awaitPage } from '../headless.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const fixtureDir = resolve(root, 'apps/site/test/fixtures/logos');
const PORT = 5197;

const bundle = await Bun.build({ entrypoints: [resolve(here, 'page.ts')], target: 'browser', format: 'esm' });
if (!bundle.success) {
	for (const log of bundle.logs) console.error(log);
	process.exit(1);
}
const pageJs = await bundle.outputs[0].text();
const names = readdirSync(fixtureDir).filter((n) => n.endsWith('.svg')).sort();
if (!names.length) {
	console.error(`No fixtures in ${fixtureDir}`);
	process.exit(1);
}

let finish;
const done = new Promise((r) => (finish = r));
let failures = 0;

const server = Bun.serve({
	port: PORT,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === '/') {
			return new Response(readFileSync(resolve(here, 'page.html')), { headers: { 'content-type': 'text/html; charset=utf-8' } });
		}
		if (url.pathname === '/page.js') return new Response(pageJs, { headers: { 'content-type': 'text/javascript' } });
		if (url.pathname === '/fixtures') return Response.json(names);
		if (url.pathname.startsWith('/fixtures/')) {
			const name = decodeURIComponent(url.pathname.slice('/fixtures/'.length));
			if (!names.includes(name)) return new Response('not found', { status: 404 });
			return new Response(readFileSync(resolve(fixtureDir, name)), { headers: { 'content-type': 'image/svg+xml' } });
		}
		if (request.method === 'POST' && url.pathname === '/log') {
			console.log('  ' + (await request.text()));
			return new Response('ok');
		}
		if (request.method === 'POST' && url.pathname === '/done') {
			failures = Number(await request.text());
			finish();
			return new Response('ok');
		}
		return new Response('not found', { status: 404 });
	}
});

await awaitPage(`http://localhost:${PORT}/`, done, { prompt: `to check ${names.length} logo fixtures`, timeoutMs: 120_000 });
server.stop(true);
if (failures) {
	console.error(`${failures} check${failures === 1 ? '' : 's'} failed.`);
	process.exit(1);
}
console.log('All fixtures passed.');
