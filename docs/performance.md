# Page load performance

What the first paint waits on, what was changed on 2026-09-04, what was measured, and what was tried and rejected. Numbers are Lighthouse 13 run locally against the live site (simulated slow 4G and a 4x slower CPU for mobile; the desktop preset for desktop). Field data from real visitors is in Cloudflare Web Analytics; check it before optimising further, because Google ranks on field data and the lab numbers are already well past its thresholds.

## The critical path

Every page is prerendered HTML. The largest contentful paint is text: the hero subtitle on phones, the h1 on desktop. Text paints once the stylesheet has arrived; the fonts then decide when it paints in its final face. Before this work the chain was:

1. HTML
2. stylesheet (render-blocking, one round trip)
3. fonts, discoverable only after the stylesheet was parsed: three full variable fonts, 138 KB, on a second round trip

JavaScript was never on that path. Total blocking time is 0 ms, hydration is small, and the engine chunk (about 30 KB gzipped) loads after the paint. Deferring it further would delay the first preview on the very connections that score badly, for no LCP gain.

## What changed

**Trimmed fonts** (`scripts/fonts.mjs`, `bun run fonts`). Each family is cut to the basic Latin repertoire (ASCII, Latin-1, the common typographic punctuation) and to the axis ranges the stylesheet actually uses: Fraunces pinned at weight 500 with optical size 18 to 72, JetBrains Mono at weight 400 to 500, Instrument Sans unchanged in range. The glyph subset barely matters (fontsource's Latin files are already tight); pinning axes does the work, because every removed axis range removes its outline deltas.

| Face | Before | After |
| --- | ---: | ---: |
| Fraunces (display) | 67 KB | 30 KB |
| Instrument Sans (body) | 30 KB | 28 KB |
| JetBrains Mono (labels) | 40 KB | 27 KB |
| First-paint fonts | 138 KB | 85 KB |

The fontsource faces stay imported in `app.css` as the fallback for characters outside the subset. The generated `lib/fonts.css` is imported after them, so its faces win for the basic range and the fuller files download only when, say, a Polish surname appears in a vCard. Files are content-hashed and cached immutably by `_headers`.

**Preloaded fonts.** The layout emits `<link rel="preload" as="font">` for the three files, so they start with the stylesheet instead of after it. The same three URLs go out as a `Link` header per page, generated into `static/_headers` by the fonts script; Cloudflare turns that into a 103 Early Hint, so a returning edge starts the fonts before the HTML body has been sent.

**2026-09-12, the "set in stone" rebrand** (`docs/ui-refresh.md` §8n). Fraunces and Instrument Sans gave way to Archivo, cut from one variable file into three first-paint faces with their axes pinned, each under a family name of its own so it can never tie with the fontsource face in font matching (a face sharing the fontsource name, with a narrower range, lost the tie and the full file downloaded instead; the old JetBrains Mono subset had been losing the same way).

| Face | File |
| --- | ---: |
| Archivo Text (body, width 100, weight 400 to 700) | 27 KB |
| Archivo Display (headings and labels, width 125, weight 600 to 800) | 20 KB |
| Archivo Caption (tile captions, capitals only, width 87.5, weight 600) | 5 KB |
| JetBrains Mono (figures) | 27 KB |
| First-paint fonts | 79 KB |

One subset covering both widths and every weight was 70 KB and cost about 380 ms of first contentful paint in Lighthouse's throttled mobile run against the previous build; the split brings that to about 130 ms (1.51 s against 1.38 s), with LCP unchanged at about 3.2 s on `vite preview`. Leaving the caption face off the preload list made first paint worse, not better, because the type tiles are in the first screen. The SVG grain on the ground and the slabs measured nothing.

**Dead settings removed.** `app.css` set the Fraunces `SOFT` and `WONK` axes, which the shipped fontsource file never carried. They are gone rather than misleading the next reader.

**Caching.** Icons, the manifest, and the Open Graph cards were served with `max-age=0`; they now cache for a day.

## Measured

| | Mobile before | Mobile after | Desktop before | Desktop after |
| --- | ---: | ---: | ---: | ---: |
| Performance | 94 | 99 | 100 | 100 |
| Accessibility | 96 | 100 | 96 | 100 |
| First contentful paint | 1.2 s | 1.2 s | 0.57 s | 0.30 s |
| Largest contentful paint | 3.0 s | 1.9 s | 0.67 s | 0.40 s |
| Page weight | 305 KB | 253 KB | 305 KB | 169 KB |

Accessibility moved because the muted text token was fixed the same day (`docs/launch.md`), not because of anything here.

## Tried and rejected

**Inlining the stylesheet** (`kit.inlineStyleThreshold`). The idea was to drop the stylesheet's round trip. A local A/B on the same build, two runs each: inlined 1.39 s and 1.33 s first paint, linked 1.22 s and 1.21 s; LCP identical at 2.42 s and 2.41 s. The larger HTML delays the first paint and LCP is bound by the fonts, so the option stays off. The note in `svelte.config.js` records this.

**Lazier engine loading.** See above: not on the path, and it would cost the first keystroke a fetch.

## Not done, could be

- Pin Fraunces optical size at 72 for the h1 alone (16 KB instead of 30) under a second family name, leaving the 18 to 72 face for h2 and h3 off the preload path. Saves 14 KB on the critical path for the cost of one more `@font-face`.
- `font-display: optional` for the mono labels would keep the fallback for the whole page load when the font arrives late, avoiding a swap. Left as `swap` so the first visit looks like the second.

## Offline and install

The service worker, what it precaches, and how to test the site offline are in `docs/pwa.md`. It changes nothing on the first-visit critical path above: registration happens on the `load` event, after the paint, and the precache install runs in the background. Repeat visits and offline loads are served from the cache instead.

## Repeat the measurement

```bash
npx --yes lighthouse https://stoneqr.app/ --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate --output=json --output-path=./lh.json --chrome-flags="--headless=new" --quiet
```

The keyless PageSpeed Insights API has a small daily quota; the local run above is the reliable path.
