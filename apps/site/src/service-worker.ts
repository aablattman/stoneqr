/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

/**
 * The offline worker. SvelteKit builds this to /service-worker.js and registers it from its own
 * hashed init script on every page, so there is no registration code anywhere else.
 *
 * Install fetches every entry in the precache list (`lib/sw-scope.ts` decides the list, and the
 * Web Worker chunks the bundle spawns are found in the code as it is stored) straight
 * from the network and stores only OK responses: right after a deploy Cloudflare can answer a
 * hashed asset with a real 404 until it has replicated, and a stored 404 would wedge the app until
 * the next version. One bad fetch fails the install, the partial cache is thrown away, and the
 * browser tries again on the next page load. Activate removes every other version's cache and
 * claims the open pages. Fetch handles same-origin GETs only: pages network-first with a short
 * timeout, hashed files and precached statics cache-first, the rest untouched.
 *
 * Nothing a user types goes near the Cache API: only the bundle, the fonts, the icons, and the
 * prerendered pages are stored, keyed by pathname with the query and fragment dropped.
 */
import { base, build, files, prerendered, version } from '$service-worker';
import { isImmutable, pagePath, precacheList, strategyFor, workerRefs } from '$lib/sw-scope';

const sw = self as unknown as ServiceWorkerGlobalScope;

const PREFIX = 'stoneqr-';
const CACHE = `${PREFIX}${version}`;
/** How long a page request waits for the network before the cached copy answers. */
const PAGE_TIMEOUT_MS = 3000;

/** Site-relative paths, `base` removed so the rules in sw-scope see the same shape in every deployment. */
const strip = (path: string) => (base && path.startsWith(base) ? path.slice(base.length) : path) || '/';
const PRECACHE = precacheList({
	build: build.map(strip),
	files: files.map(strip),
	prerendered: prerendered.map(strip)
});
const PRECACHED = new Set(PRECACHE);
const PAGES = new Set(prerendered.map(strip));
const NOT_FOUND = '/404';

const url = (path: string) => new URL(base + path, sw.location.href).href;

/**
 * `vite dev` registers this file too, with an empty `build` and no prerendered pages. Caching
 * there would only get in the way of hot reloads, so in dev the worker installs and does nothing.
 */
const INERT = build.length === 0;

sw.addEventListener('install', (event) => {
	if (INERT) return;
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			try {
				// A few at a time: about seventy files on a phone should not open seventy connections.
				const queue = [...PRECACHE];
				const queued = new Set(queue);
				const worker = async () => {
					for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
						// cache: 'reload' bypasses the HTTP cache so a stale copy is never promoted into ours.
						const response = await fetch(url(path), { cache: 'reload' });
						if (!response.ok) throw new Error(`precache ${path}: ${response.status}`);
						// The bundle's Web Workers are not in `build` (see workerRefs); find them in the code.
						const scan = isImmutable(path) && path.endsWith('.js') ? response.clone().text() : null;
						await cache.put(url(path), response);
						if (scan) {
							for (const ref of workerRefs(await scan, path)) {
								if (queued.has(ref)) continue;
								queued.add(ref);
								queue.push(ref);
							}
						}
					}
				};
				await Promise.all(Array.from({ length: 6 }, worker));
			} catch (error) {
				// Leave nothing half-filled behind; the next load installs from scratch.
				await caches.delete(CACHE);
				throw error;
			}
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

sw.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (INERT || request.method !== 'GET') return;
	const requested = new URL(request.url);
	if (requested.origin !== sw.location.origin) return;
	const path = strip(requested.pathname);
	const strategy = strategyFor(path, {
		navigate: request.mode === 'navigate',
		pages: PAGES,
		precached: PRECACHED
	});
	if (strategy === 'network') return;
	if (strategy === 'page') event.respondWith(servePage(request, pagePath(path)));
	else event.respondWith(serveAsset(request, path));
});

/**
 * Network first, so a fresh deploy is what you see while online, with the cache answering when
 * the network fails or dawdles. A good response refreshes the cached copy. A page we have never
 * seen falls back to the cached 404 page, sent with a 404 status so it stays honest.
 */
async function servePage(request: Request, path: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	const key = url(path);
	try {
		const response = await withTimeout(fetch(request), PAGE_TIMEOUT_MS);
		if (response.ok && PAGES.has(path)) await cache.put(key, response.clone());
		if (response.ok || response.status === 404) return response;
		return (await cache.match(key)) ?? response;
	} catch {
		const cached = await cache.match(key);
		if (cached) return cached;
		const notFound = await cache.match(url(NOT_FOUND));
		if (notFound) {
			return new Response(notFound.body, { status: 404, statusText: 'Not Found', headers: notFound.headers });
		}
		return new Response('Offline, and this page is not stored on this device.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}
}

/**
 * Cache first. The precache should already hold it; if not (a lazy chunk from a build the
 * worker was not told about, which cannot happen with SvelteKit, but costs nothing to allow),
 * fetch it and keep it only when it is a hashed file and the response is good.
 */
async function serveAsset(request: Request, path: string): Promise<Response> {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(url(path));
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok && isImmutable(path)) await cache.put(url(path), response.clone());
	return response;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}
