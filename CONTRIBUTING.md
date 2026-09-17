# Contributing

Thanks for looking. The most useful contribution right now is a **real-phone scan report**: which phone, which scanner app, which export format and print size, and whether it scanned. Open a [scan report](https://github.com/malignantz/stoneqr/issues/new?template=scan-report.yml) and it goes into `docs/scan-matrix.md`.

## Setup

```bash
bun install
bun run dev        # http://localhost:5173
bun run test       # engine, then the site's pure modules
bun run check      # svelte-check
bun run build
```

Read `plan.md` first; it is the source of truth for scope and architecture. `CLAUDE.md` records the rules the code follows (shared control primitives, the privacy rule, the decode check on every download).

## Rules that are not negotiable

- Nothing a user types may leave the browser. No server-side payload handling, ever.
- Every download passes a decode check before it is offered.
- Golden files in `packages/engine/test/golden/` and `apps/site/test/golden/` pin the hand-built renderers byte for byte. When a renderer change is intended, read the diff, then regenerate with `UPDATE_GOLDENS=1 bun run test`; never regenerate to make a red test pass.
- The core JavaScript path stays under 150 KB gzipped on the generator page (`bun run budget` after a build).
- Do not add `sharp`, `node-canvas`, `jsdom`, or `@qr-platform/qr-code.js`.

## Pull requests

Small and focused. Run `bun run test` and `bun run check` first. CI also runs `bun run logo-fixtures --headless` and `bun run scan-sheets --headless`, the two checks that need a real browser; run them the same way locally (Chrome is found on its own, or set `CHROME_PATH`), or without the flag and open the URL they print. If you add a route, add it to `scripts/og/routes.mjs` and run `bun run og` so it gets an Open Graph card and a sitemap entry.
