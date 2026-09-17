# StoneQR

[![CI](https://github.com/malignantz/stoneqr/actions/workflows/ci.yml/badge.svg)](https://github.com/malignantz/stoneqr/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-1f6f63.svg)](LICENSE)

**QR codes set in stone. Generated in your browser, never expire.**

A free, open-source (MIT) QR code generator that runs entirely in the browser. Static codes never touch a server, so they cannot expire or be deactivated. Built for people who print: error-correction control, a print-size and scan-distance calculator, vector exports with real millimetre dimensions, logos (PNG, JPEG, WebP, or SVG, the last staying vector into the SVG export) with a crop box that is the blank space itself, sized by stepping through the widths the code can actually produce, with a cover cap, a call-to-action frame, Artistic QR, a halftone mode that blends a photo through the whole code (with a draggable crop box), and a decode check before every download. The generator has a Basic control set for the common case and an Advanced one for everything else. Basic sizes are four plain-language tiers (business card, menu, poster, storefront sign) whose reading distances come from the same 10:1 rule as the calculator; Advanced takes exact widths, units, and scan distances.

Live at [stoneqr.app](https://stoneqr.app). Made by [Garrett Holmes](https://www.linkedin.com/in/garrettholmes), who also makes [SignUpCity](https://signupcity.app). Questions: hello@stoneqr.app.

## Layout

```
apps/site/        SvelteKit (Svelte 5) + adapter-static, prerendered; deployed as Cloudflare static assets
packages/engine/  @stoneqr/engine: encode, payloads, sizing, verify, SVG/PDF/EPS/PNG exports, label sheets
docs/             research notes and the real-phone scan matrix
plan.md           scope, architecture, milestones
```

## Develop

```bash
bun install
bun run dev        # site at http://localhost:5173
bun run test       # unit tests (vitest): engine, then the site's pure modules
bun run og         # redraw the per-route Open Graph cards (opens a local page; add --headless to skip the tab)
bun run icons      # redraw favicon.ico, apple-touch-icon.png, and the manifest icons
bun run sitemap    # rewrite sitemap.xml with lastmod dates from git (deploy.sh does this too)
bun run fonts      # rebuild the trimmed first-paint fonts and their preload headers
bun run scan-sheets # build docs/scan-sheets.pdf, the printable sheets for the real-phone scan matrix (add --headless to skip the tab; CI runs this)
bun run logo-fixtures # check the SVG-logo fixtures in a real browser (add --headless to skip the tab; CI runs this)
bun run check      # svelte-check, then tsc over the scripts
bun run build      # static output in apps/site/build
./deploy.sh        # build + wrangler pages deploy
```

## Engine

`@stoneqr/engine` is pure TypeScript with no DOM dependency in its core path. It runs in Node, Workers, and browsers. The site uses that for its two Web Workers: bulk generation and halftone PNG export, so a poster-size raster never blocks the page.

```ts
import { encode, renderSvg, assess, rasterize, verifyRaster } from '@stoneqr/engine';
import { payloads } from '@stoneqr/engine/payloads';

const text = payloads.wifi({ ssid: 'Office', password: 'secret', auth: 'WPA' });
const qr = encode(text, { ecc: 'M' });               // matrix, version, function-pattern mask
const svg = renderSvg(qr, { widthMm: 30 });          // one path, width="30mm"
const warnings = assess({ widthMm: 30, size: qr.size });
const check = verifyRaster(rasterize(qr), text);     // { ok: true }
```

Subpaths: `./payloads`, `./sizing`, `./render/halftone` (picture-over-matrix renderer with the decode-verified fallback ladder), `./export/pdf` (pdf-lib), `./export/eps`, `./export/png`, `./labels` (Avery geometry and label-sheet PDFs), `./verify`.

## Privacy promise

Nothing a user types leaves the browser in static mode. There is no server-side payload handling and never will be. See [`/privacy`](https://stoneqr.app/privacy) and [`/open-source`](https://stoneqr.app/open-source).

## Contributing

The most useful contribution is a real-phone scan report for `docs/scan-matrix.md`: open a [scan report](https://github.com/malignantz/stoneqr/issues/new?template=scan-report.yml). Code contributions: see `CONTRIBUTING.md`; security reports: see `SECURITY.md`.

## License

MIT. See `LICENSE`.
