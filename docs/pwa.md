# Offline and install

StoneQR is an installable web app: `static/manifest.webmanifest` and the icons in `app.html` make it installable, and the service worker in `apps/site/src/service-worker.ts` makes every feature work with no connection. Built 2026-09-05. Nothing here changes the site's one rule: nothing a user types leaves the browser, and nothing a user types is stored by the worker either. The Cache API holds the app; the design lives in localStorage and IndexedDB as before (`docs/ui-refresh.md`, M11).

## How it is wired

SvelteKit builds `src/service-worker.ts` to `/service-worker.js` at the root of the output and registers it from its own hashed init script on every prerendered page, so there is no registration code in the app and no extra CSP hash: the registration is part of the script whose hash SvelteKit already puts in each page's `<meta http-equiv="content-security-policy">`. `worker-src 'self'` in `svelte.config.js` covers the worker file itself. The worker imports `$service-worker` (SvelteKit's `build`, `files`, `prerendered`, `version`) and `lib/sw-scope.ts`, which holds the pure rules below so `test/service-worker.test.ts` can pin them in vitest.

In `vite dev` SvelteKit serves the same file with an empty `build`; the worker treats that as a signal to install and do nothing, so hot reloads are never answered from a cache.

## What is precached

One cache per build, named `stoneqr-<version>` (`version` is SvelteKit's build timestamp). About 1.7 MB, 76 entries, on the 2026-09-05 build; the budget is 10 MB.

| Group | What | Size |
| --- | --- | ---: |
| Bundle | every file in `build`: entry, nodes, chunks (the lazy qr-code-styling, pdf-lib, papaparse, and jsQR chunks included), the stylesheet | 1.0 MB |
| Workers | `_app/immutable/workers/*`: the halftone export worker and the bulk worker | 67 KB |
| Fontsource fallbacks | the fuller `.woff2` files under `_app/immutable/assets`, so a Polish surname in a vCard still renders offline | 272 KB |
| Subset fonts | `fonts/*.woff2`, the first-paint faces | 85 KB |
| Pages | every prerendered route, `/404` included | 291 KB |
| Install | `manifest.webmanifest`, the favicons, the touch icon, the manifest icons | 11 KB |

The worker chunks deserve a note. `build` comes from Vite's client manifest, which does not list worker output, so a precache of `build` alone leaves Photo QR export and the bulk page broken offline. Rather than a hard-coded list that goes stale with the next hash, the install step reads each JavaScript file as it stores it and picks out the `../workers/<name>-<hash>.js` references (`workerRefs` in `sw-scope.ts`), then fetches those too.

**Excluded**: `/og/*` and `og.png` (the Open Graph cards, half a megabyte that only link unfurlers fetch), `sitemap.xml`, `robots.txt`, `llms.txt`, `.well-known/*`, and the Pages control files `_headers` and `_redirects`. Requests for these pass straight to the network and are never stored.

## Install, activate, update

**Install** fetches every entry with `cache: 'reload'`, so the browser's HTTP cache is bypassed and a stale copy is never promoted into ours, and stores only responses with `response.ok`. This matters on Cloudflare: right after a deploy an edge can answer a hashed asset with a real 404 until it has replicated (the incident in `docs/launch.md` and the poll in `deploy.sh`). A stored 404 would wedge the app until the next version, so one bad response fails the whole install, the partial cache is deleted, and the browser retries on the next page load with the previous worker still serving. Fetches run six at a time.

**Activate** deletes every other `stoneqr-*` cache and calls `clients.claim()`, so the first install starts serving the open tab without a reload.

**Update.** A new build is a new `service-worker.js` (served with `Cache-Control: no-cache` from `static/_headers`, so the browser's update check sees it at once rather than after its 24-hour default). SvelteKit also calls `registration.update()` on every client-side navigation. The new worker installs its cache in the background and then waits; it never takes over a page mid-edit. `routes/+layout.svelte` watches the registration and, once a worker is installed behind a controlling one, shows "A new version of StoneQR is ready" with a Reload button at the top of the page (the bottom belongs to `PreviewBar` on phones). Reload posts `{ type: 'SKIP_WAITING' }`, the worker calls `skipWaiting()`, and the layout reloads on `controllerchange`. That event also fires on the very first `clients.claim()`, so the layout reloads only when it asked for the swap. "Later" hides the banner; the update is applied on the next full load anyway.

The first time a worker is active on a device the layout shows "Available offline" once, for eight seconds, and records it in `localStorage` under `stoneqr.offlineNotice`.

## Fetch strategy

Only same-origin GET requests are handled; Cloudflare Insights and any other origin are never touched.

| Request | Strategy |
| --- | --- |
| Navigations, and any GET for a prerendered path | Network first with a 3 s timeout, then cache. A good network response refreshes the cached page, so a deploy is what you see while online. Offline, a path that was never prerendered gets the cached `/404` page with a 404 status; if even that is missing, a plain 503 text response. |
| `/_app/immutable/*` and `/fonts/*` | Cache first. If a hashed file is somehow not stored, it is fetched and kept only when the response is OK. |
| Other precached statics (manifest, icons) | Cache first. |
| Everything else (`/og/*`, `_app/version.json`, unknown paths fetched as subresources) | Not handled; the browser goes to the network as if there were no worker. |

Pages are keyed by pathname alone: `/wifi/`, `/wifi?x=1`, and a share link `/#1.…` all resolve to the cached `/wifi` or `/`. The query and fragment never enter the cache.

## Deploying

`deploy.sh` adds `service-worker.js` to the list of hashed assets it polls and warms after a Pages deploy, because the worker precaches every one of those files and the first visitor's install would otherwise fail (harmlessly, and retry next load) while the edge is still catching up. Keep the `_headers` rule for `/service-worker.js` and that list in step with the worker.

## Testing offline

1. `bun run build`, then `bun run --cwd apps/site preview --port 4180` (the `preview` entry in `.claude/launch.json`), and open it in Chrome.
2. DevTools, Application, Service workers: the worker should be activated and running; Cache storage should show one `stoneqr-<version>` cache with about 76 entries. The Manifest pane should list no errors and offer Install.
3. Tick Offline in the Service workers pane (or Network, throttling, Offline) and reload: every page opens, the generator hydrates, a typed URL previews and reads "Scannable", Photo QR export runs, `/bulk` runs, and `/this-does-not-exist` shows the 404 page.
4. Untick Offline, rebuild, and reload: the banner appears; Reload swaps the worker and Cache storage shows only the new version.
5. Console, Application, and the Lighthouse PWA audit should all be clean.

The same checks were run on 2026-09-05 through the Browser pane against `vite preview` with the server stopped: every precached path answered in about 1 ms from the cache, `/nope` navigated to the cached 404 page with status 404 and zero bytes transferred, `/photo` hydrated and decoded a typed URL with no network resource, and the console was empty.
