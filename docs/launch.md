# Launch and distribution punchlist

Written 2026-09-04 after a completeness audit. Items marked **done** shipped that day; the rest need Garrett, an account, or a decision. Third-party listings are ordered by expected traffic for this audience (people who print things, small businesses, privacy-minded developers).

## What shipped on 2026-09-04

- Favicon set: `favicon.ico` (16/32/48), `apple-touch-icon.png`, manifest icons, and `manifest.webmanifest`, all drawn by `bun run icons` from the `favicon.svg` design. Google Search Console only shows a favicon after Google recrawls the home page; expect days, not hours.
- Structured data: every page carries a JSON-LD graph (WebSite, WebPage); the home page adds a `WebApplication` node with price 0, MIT licence, and the feature list.
- `sitemap.xml` now carries `lastmod` dates from git (`bun run sitemap`, run by `deploy.sh`). It was already live and linked from `robots.txt`; it still has to be submitted in Search Console by hand.
- `/.well-known/security.txt`, `llms.txt`, `SECURITY.md`, `CONTRIBUTING.md`, issue templates (scan report, bug), private vulnerability reporting enabled on GitHub, and repo topics.
- Privacy page: removed the claim about a "generated" analytics event that was never built; added a one-paragraph terms note (MIT, no warranty, scan a proof before printing a thousand). The policy itself is fine as it stands: a site with no accounts and no data collection needs only what is there, and Cloudflare Web Analytics is cookie-free.
- Accessibility: the muted text token `ink-3` was 4.2:1 on the card background; it is now 5.3:1 or better on every surface it is used on.
- Footer: "Report a scan result" link to the scan-report issue template.

Lighthouse on the live home page after the font work the same evening (`docs/performance.md`): desktop 100 / 100 / 100 / 100, mobile 99 / 100 / 100 / 100 (performance, accessibility, best practices, SEO). Mobile LCP went from 3.0 s to 1.9 s by trimming and preloading the fonts. Initial JavaScript 96.7 KB gzipped against a 150 KB budget.

## Product: remaining before calling it 1.0

1. **Real-device scan matrix** (`docs/scan-matrix.md`). Print the test sheet, scan with three phones, fill the tables. This is also marketing content: "we scanned every export at every size on these phones" is a claim no competitor makes.
2. **Phone checks from M10**: the pinned preview bar and the actual-size preview on a real phone.
3. **Publish `@stoneqr/engine` to npm** (the last M7 item). The package currently points `main` at TypeScript source, which only works inside this workspace. Needs a `dist` build with `.d.ts` files and an exports map that keeps the site importing source in dev. One evening; a decision below.
4. **Offline**: built 2026-09-05, see `docs/pwa.md`. The worker precaches the bundle, fonts, icons, and every prerendered page, but stores only OK responses and fails the whole install on a 404, and pages are network-first, so the deploy-cache incident cannot repeat through it: a page that is stale is refreshed on the next online visit and a bad asset is never kept.
5. **Renew** `security.txt` before 2027-09-01.

## Third-party services (need your accounts)

1. **Google Search Console**: submit `https://stoneqr.app/sitemap.xml` under Sitemaps; use URL inspection → Request indexing on `/`, `/wifi`, `/vcard`, `/photo`, `/print-size`. Check the favicon under the home page's inspection after the next crawl.
2. **Bing Webmaster Tools**: "Import from Google Search Console" is one click and covers Bing, DuckDuckGo, and Yahoo. Then Cloudflare → Caching → Configuration → **Crawler Hints** (on) so Cloudflare pushes IndexNow pings to Bing and Yandex on every deploy.
3. **Cloudflare managed robots.txt**: the dashboard is rewriting `robots.txt` with "content signals" and a hard `Disallow: /` for GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, and others. `ai-train=no` is a reasonable stance, but the outright disallows also stop ChatGPT search, Claude, and Perplexity from *citing* the site, which is a growing discovery channel for "free QR code generator that does not expire". Decision below. It lives under Security → Bots (or the domain's Overview → "Manage AI crawlers").
4. **GitHub**: upload `apps/site/static/og.png` as the social preview (Settings → General → Social preview; no API for this), tag `v1.0.0` with release notes once the scan matrix is filled, and consider enabling Discussions as the place for "will this scan on my label printer" questions.
5. **npm**: publish once item 3 above is built. Developers who install the engine link back to the site.
6. **SignUpCity**: a footer or blog link from signupcity.app to stoneqr.app is the easiest quality backlink available and costs nothing.
7. **Social handle**: `twitter:site` is unset because there is no account. Bluesky or Mastodon posts get most of their reach from reposts by the Svelte and privacy communities rather than followers, so a handle is useful but not urgent.

## Where to list it, in order

**Tier 1: a launch day each**

- **Hacker News, Show HN.** The single best channel for an open-source, no-server, privacy-first tool. Tuesday to Thursday, 8 to 10 am Eastern. Answer every comment for the first three hours. Draft below.
- **Product Hunt.** Needs a maker account and a scheduled launch (12:01 am Pacific). Assets: the 512 icon, 3 to 5 gallery images at 1270 × 760 (the generator, a Photo QR, the print-size calculator, the bulk label sheet), and a first comment from the maker. Draft below.
- **Reddit.** r/webdev "Showoff Saturday" thread, r/SideProject, r/opensource, r/sveltejs (built on Svelte 5, halftone in a worker), r/privacy (read the self-promotion rule first; frame it as a tool that solves the tracking-QR problem). r/smallbusiness and r/restaurantowners work only as answers to "which QR generator" threads, never as link posts.

**Tier 2: evergreen directories (backlinks and "alternative to" searches)**

- **AlternativeTo**: list as an alternative to QR Code Monkey, qr-code-generator.com, QR Code Generator by Bitly, Canva's QR tool, Adobe Express QR. "X alternative" is a search people actually run after a code expires.
- **G2 and Capterra**: free listings in the "QR Code Generator Software" category; they rank for commercial queries.
- **Svelte Society showcase** (sveltesociety.dev) and the `awesome-svelte` list.
- **Privacy directories**: Privacy Guides forum tool suggestions, `awesome-privacy` on GitHub, the r/PrivacyGuides recommendation thread.
- **Product directories** with real referral traffic: Uneed, SaaSHub, BetaList (needs to be "new"; do it before Product Hunt), Tiny Tools directories such as tinytools.directory.
- **Lobste.rs** (needs an invitation; the halftone article fits its audience).

**Tier 3: content that earns links over time**

- A technical article on dev.to or the site itself: "How a photo fits inside a QR code and still scans" (the halftone renderer, the function-pattern mask, the decode-verified fallback ladder). Engineers link to this kind of thing.
- "Why free QR codes stop working" as a standalone explainer, republished on Medium and dev.to with a canonical link back to `/never-expires`.
- More landing pages for high-intent queries that the same generator already serves: `/menu` (restaurant menu QR code), `/business-card`, `/sticker`. Each is one route, one `OG_ROUTES` entry, and `bun run og`.
- A short screen recording (30 s) of Photo QR for Product Hunt, Reddit, and the GitHub README.

## Drafts

**Show HN title**: `Show HN: StoneQR – Free QR codes generated in your browser that never expire`

**Show HN text**:

> I kept seeing printed QR codes that stopped working because they were "dynamic" codes from a free trial that lapsed. StoneQR only makes static codes, computed on your device, so there is nothing to expire and nothing to upload.
>
> It is built for print: SVG, PDF (CMYK), and EPS with real millimetre sizes, a print-size and scan-distance calculator, logos with a coverage cap, bulk generation to Avery label sheets, and a decode check on every download so the file you get actually scans. The unusual bit is Photo QR, which blends a picture into the modules and verifies the result still decodes.
>
> MIT licensed, SvelteKit plus a pure-TypeScript engine, hosted as static files on Cloudflare. No accounts, no database, no server-side code. Happy to answer questions about the halftone renderer or the decode-verification loop.

**Product Hunt tagline** (under 60 characters): `Free QR codes made in your browser. They never expire.`

**Product Hunt description**:

> StoneQR is a free, open-source QR code generator that runs entirely in your browser. Nothing you type is uploaded, so there is no account to lapse and no code that can be switched off. Made for printing: vector SVG, PDF, and EPS exports with real millimetre sizes, a print-size calculator, logos, bulk label sheets, and a decode check before every download. Photo QR blends a picture into the code itself and still scans.

**Reddit, r/webdev**:

> I built a QR generator that runs entirely client-side (SvelteKit, TypeScript engine, no server). The interesting engineering: a halftone renderer that fits a photo into the modules and then decode-checks the result in a Web Worker, a hand-written SVG/EPS/PDF pipeline with real mm dimensions, and an Avery label-sheet layout for bulk. MIT licensed, source on GitHub. Would love scan reports from your phones; there is an issue template for it.

**Short post (Bluesky, Mastodon, LinkedIn)**:

> QR codes that never expire, because they never touch a server. Free, open source, made in your browser, with print-ready SVG/PDF/EPS and a decode check on every download. stoneqr.app
