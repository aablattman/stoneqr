import { describe, expect, it } from 'vitest';
import { isImmutable, pagePath, precacheList, precacheable, strategyFor, workerRefs } from '$lib/sw-scope';

/** A stand-in for what `$service-worker` hands the worker after a build of this site. */
const scope = {
	build: [
		'/_app/immutable/entry/start.DGquo7zQ.js',
		'/_app/immutable/chunks/DsgNC7nG.js',
		'/_app/immutable/workers/halftone.worker-DDEe-NBa.js',
		'/_app/immutable/assets/0.CJcjJNj7.css',
		'/_app/immutable/assets/fraunces-latin-opsz-normal.DihXLNYH.woff2'
	],
	files: [
		'/_headers',
		'/apple-touch-icon.png',
		'/favicon.ico',
		'/favicon.svg',
		'/fonts/fraunces.7716ddd0.woff2',
		'/fonts/instrument-sans.13f38f0b.woff2',
		'/icon-192.png',
		'/icon-512.png',
		'/icon-maskable-512.png',
		'/llms.txt',
		'/manifest.webmanifest',
		'/og.png',
		'/og/wifi.png',
		'/og/index.png',
		'/robots.txt',
		'/sitemap.xml',
		'/.well-known/security.txt'
	],
	prerendered: ['/', '/wifi', '/vcard', '/404']
};

describe('precacheable', () => {
	it('keeps the fonts, icons, and manifest', () => {
		for (const path of [
			'/fonts/fraunces.7716ddd0.woff2',
			'/manifest.webmanifest',
			'/icon-192.png',
			'/icon-maskable-512.png',
			'/apple-touch-icon.png',
			'/favicon.ico',
			'/favicon.svg'
		]) {
			expect(precacheable(path), path).toBe(true);
		}
	});

	it('drops the Open Graph cards, crawler files, security contact, and Pages control files', () => {
		for (const path of [
			'/og/wifi.png',
			'/og/index.png',
			'/og.png',
			'/sitemap.xml',
			'/robots.txt',
			'/llms.txt',
			'/.well-known/security.txt',
			'/_headers',
			'/_redirects'
		]) {
			expect(precacheable(path), path).toBe(false);
		}
	});

	it('does not confuse a page or asset that merely contains an excluded word', () => {
		expect(precacheable('/blog/og-cards')).toBe(true);
		expect(precacheable('/logo.png')).toBe(true);
	});
});

describe('precacheList', () => {
	const list = precacheList(scope);

	it('takes every build file, the surviving static files, and every prerendered page', () => {
		expect(list).toEqual([
			...scope.build,
			'/apple-touch-icon.png',
			'/favicon.ico',
			'/favicon.svg',
			'/fonts/fraunces.7716ddd0.woff2',
			'/fonts/instrument-sans.13f38f0b.woff2',
			'/icon-192.png',
			'/icon-512.png',
			'/icon-maskable-512.png',
			'/manifest.webmanifest',
			'/',
			'/wifi',
			'/vcard',
			'/404'
		]);
	});

	it('contains nothing excluded and no duplicates', () => {
		expect(list.every(precacheable)).toBe(true);
		expect(new Set(list).size).toBe(list.length);
		expect(precacheList({ ...scope, files: [...scope.files, '/favicon.ico'] })).toEqual(list);
	});

	it('includes the lazy chunks and the halftone worker through build', () => {
		expect(list).toContain('/_app/immutable/workers/halftone.worker-DDEe-NBa.js');
		expect(list).toContain('/_app/immutable/chunks/DsgNC7nG.js');
	});
});

describe('workerRefs', () => {
	it('resolves the worker chunks a built chunk spawns against that chunk', () => {
		// The shape Vite emits for `new Worker(new URL('./halftone.worker.ts', import.meta.url))`.
		const source =
			'let c=new Worker(new URL(``+new URL(`../workers/halftone.worker-DDEe-NBa.js`,import.meta.url).href,``+import.meta.url),{type:`module`})';
		expect(workerRefs(source, '/_app/immutable/chunks/DdNJ4TEP.js')).toEqual([
			'/_app/immutable/workers/halftone.worker-DDEe-NBa.js'
		]);
		expect(workerRefs('new URL("../workers/worker-q_vouYU4.js",import.meta.url)', '/_app/immutable/nodes/4.BhzbqERU.js')).toEqual([
			'/_app/immutable/workers/worker-q_vouYU4.js'
		]);
	});

	it('finds each reference once and ignores code without workers', () => {
		const twice = "'../workers/a-1.js' and '../workers/a-1.js' and '/_app/immutable/workers/b-2.js'";
		expect(workerRefs(twice, '/_app/immutable/chunks/x.js')).toEqual([
			'/_app/immutable/workers/a-1.js',
			'/_app/immutable/workers/b-2.js'
		]);
		expect(workerRefs('const workers = 3; fetch("/api/workers")', '/_app/immutable/chunks/x.js')).toEqual([]);
	});
});

describe('isImmutable', () => {
	it('is the hashed bundle and the subset fonts only', () => {
		expect(isImmutable('/_app/immutable/chunks/DsgNC7nG.js')).toBe(true);
		expect(isImmutable('/fonts/fraunces.7716ddd0.woff2')).toBe(true);
		expect(isImmutable('/_app/version.json')).toBe(false);
		expect(isImmutable('/manifest.webmanifest')).toBe(false);
		expect(isImmutable('/wifi')).toBe(false);
	});
});

describe('pagePath', () => {
	it('drops a trailing slash but keeps the root', () => {
		expect(pagePath('/wifi/')).toBe('/wifi');
		expect(pagePath('/wifi')).toBe('/wifi');
		expect(pagePath('/')).toBe('/');
	});
});

describe('strategyFor', () => {
	const list = precacheList(scope);
	const opts = (navigate: boolean) => ({ navigate, pages: new Set(scope.prerendered), precached: new Set(list) });

	it('serves navigations and known pages network-first', () => {
		expect(strategyFor('/wifi', opts(true))).toBe('page');
		expect(strategyFor('/wifi/', opts(false))).toBe('page');
		expect(strategyFor('/nowhere', opts(true))).toBe('page');
	});

	it('serves hashed files cache-first even when the worker was not told about them', () => {
		expect(strategyFor('/_app/immutable/chunks/DsgNC7nG.js', opts(false))).toBe('immutable');
		expect(strategyFor('/_app/immutable/chunks/unknown.js', opts(false))).toBe('immutable');
		expect(strategyFor('/fonts/fraunces.7716ddd0.woff2', opts(false))).toBe('immutable');
	});

	it('serves precached statics cache-first and leaves everything else to the network', () => {
		expect(strategyFor('/manifest.webmanifest', opts(false))).toBe('asset');
		expect(strategyFor('/icon-192.png', opts(false))).toBe('asset');
		expect(strategyFor('/og/wifi.png', opts(false))).toBe('network');
		expect(strategyFor('/sitemap.xml', opts(false))).toBe('network');
		expect(strategyFor('/_app/version.json', opts(false))).toBe('network');
	});
});
