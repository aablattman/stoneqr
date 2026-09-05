/**
 * What the service worker precaches and how it answers each request. Pure functions, so the
 * rules can be tested in vitest without a worker environment; `service-worker.ts` imports them
 * and is otherwise only plumbing. Every path here is site-relative and starts with a slash;
 * the worker strips `$service-worker`'s `base` before asking and adds it back after.
 */

/**
 * Left out of the precache: the Open Graph cards (large, only ever fetched by link unfurlers),
 * the crawler files, the security contact, and the Pages control files that are never served.
 */
const EXCLUDED = [
	/^\/og\//,
	/^\/og\.png$/,
	/^\/sitemap\.xml$/,
	/^\/robots\.txt$/,
	/^\/llms\.txt$/,
	/^\/\.well-known\//,
	/^\/_headers$/,
	/^\/_redirects$/
];

export function precacheable(path: string): boolean {
	return !EXCLUDED.some((rule) => rule.test(path));
}

/**
 * The full precache list in fetch order: the app bundle first (so a failure there fails fast),
 * then the static files that survive the exclusions, then every prerendered page. Deduplicated,
 * because a static file can also be referenced by the bundle.
 */
export function precacheList(scope: { build: string[]; files: string[]; prerendered: string[] }): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const path of [...scope.build, ...scope.files.filter(precacheable), ...scope.prerendered]) {
		if (seen.has(path)) continue;
		seen.add(path);
		out.push(path);
	}
	return out;
}

/**
 * The Web Worker chunks a piece of the bundle spawns, as site-relative paths. Vite's client
 * manifest, which is where `$service-worker`'s `build` comes from, never lists worker output
 * (`_app/immutable/workers/*`), so the halftone and bulk workers would be missing offline. The
 * bundle references each one as `new URL('../workers/<name>-<hash>.js', import.meta.url)`, so the
 * install step scans every JavaScript file it stores and resolves those against the file's path.
 */
export function workerRefs(source: string, from: string): string[] {
	const found = new Set<string>();
	for (const match of source.matchAll(/[`'"]((?:\.{1,2}\/)*[A-Za-z0-9_./-]*workers\/[A-Za-z0-9_.-]+\.js)[`'"]/g)) {
		found.add(new URL(match[1], `http://sw${from}`).pathname);
	}
	return [...found];
}

/** Content-hashed files: the SvelteKit bundle and the subset fonts. Safe to serve from cache forever. */
export function isImmutable(path: string): boolean {
	return path.startsWith('/_app/immutable/') || path.startsWith('/fonts/');
}

/**
 * The cache key for a page request: the pathname alone, with any trailing slash removed, so
 * `/wifi/`, `/wifi?x=1`, and `/wifi#1.abc` all resolve to the cached `/wifi`. Query strings and
 * fragments never reach the cache; a design share link stays in the address bar only.
 */
export function pagePath(pathname: string): string {
	if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
	return pathname;
}

export type Strategy = 'page' | 'immutable' | 'asset' | 'network';

/**
 * How a same-origin GET is served. Pages go network-first so a deploy is picked up while online
 * and the cached copy answers offline; hashed files and precached static files go cache-first;
 * everything else (Open Graph cards, `_app/version.json`, anything unknown) is passed to the
 * network untouched and never cached.
 */
export function strategyFor(
	pathname: string,
	opts: { navigate: boolean; pages: Set<string>; precached: Set<string> }
): Strategy {
	if (opts.navigate || opts.pages.has(pagePath(pathname))) return 'page';
	if (isImmutable(pathname)) return 'immutable';
	if (opts.precached.has(pathname)) return 'asset';
	return 'network';
}
