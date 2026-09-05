# StoneQR: Plan

*QR codes set in stone. Generated in your browser, never expire.*

Status: written 2026-09-02; M1 to M8 built; the silhouette tone, built-in shapes, and `/photo` added 2026-09-03 (section 7 and milestone M9); the UI refresh planned and built 2026-09-04 (milestone M10, `docs/ui-refresh.md`), followed the same day by a second design pass, style presets, a draggable crop box, and a real 404 page with post-deploy asset verification. This document is self-contained; the broader SignUpCity context lives in the private `signupcity` repo. Technical research behind the library and sizing choices is in `docs/research/qr-technical.md`.

---

## 1. What StoneQR is

A free, open-source (MIT) QR code generator that runs entirely in the browser, with the controls a print shop or an events person actually needs: error-correction level, physical size and scan-distance math, vector export, logo embedding, an artistic halftone mode, bulk generation, and label sheets. Static codes never touch a server, so they cannot expire, which is the whole point.

An optional "make it editable and trackable" mode turns a code into a dynamic one by handing off to SignUpCity's link service (a separate, private product by the same maker). StoneQR itself has no accounts, no database, and no server logic beyond static hosting.

### The wound it treats

The QR category's loudest complaint is the trial-deactivation trap. qr-code-generator.com (owned by Bitly) issues "free" codes that stop working after about 14 days; it sits at 1.5 out of 5 on roughly 9,200 Trustpilot reviews and has a BBB scam-tracker entry. Bitly QR is named alongside it. Google autocomplete for "free qr code generator" leads with "that doesn't expire", "no sign up", and "no expiration". Microsoft's community forum has threads literally titled "QR code creator free and no expiration." Hacker News threads about expiring QR codes get traction on the grievance alone.

QRCode Monkey is the best free static designer today, but its upsell hands users to the very sites that run the trap, and it was acquired by the same group in 2024.

### Positioning

- **Name and tagline:** StoneQR. "QR codes set in stone. Generated in your browser, never expire."
- **Domain:** stoneqr.app (available 2026-09-02 via RDAP; qrstone.app also available as an alternate spelling). Registration is Garrett's action.
- **Audience:** anyone who prints a QR code: events people, office managers, executive assistants, restaurants, wedding planners, teachers, small businesses. Far broader than the SignUpCity audience, which is why it is its own brand.
- **Promise, stated on every page:** static codes are generated on your device and never sent anywhere; we cannot deactivate them because we never had them. Dynamic codes (via SignUpCity) carry a published no-deactivation policy.
- **Open source:** the whole site and engine are public under MIT. "Verify it yourself" is the trust claim and a public repo proves it. QR generation is a commodity; the value is the brand, the search position, and the print-quality features.

---

## 2. Product principles

1. **Nothing leaves the browser in static mode.** No analytics on payload content, no uploads, no server render. Site analytics are Cloudflare Web Analytics (cookie-less, page-level only).
2. **Print-safe by default.** Every download passes a decode check; the sizing panel warns before someone prints a code that will not scan.
3. **No account, no email, no dark patterns.** No "sign up to download SVG." No trial timers. No upsell to a third party.
4. **Vector first.** SVG with real millimetre dimensions is the primary export. PNG is a convenience.
5. **Honest about physics.** The sizing calculator tells people when their code is too small, their logo too big, or their colours too close, in plain language.
6. **Small.** The generator page should be usable on a phone in a noisy room. Initial JavaScript under 150 KB gzipped for the core path; styled and halftone modes load lazily.

---

## 3. Scope

### v1 (launch)

**Content types:** URL, plain text, WiFi (WPA/WPA2, WEP, open, hidden network flag), vCard 3.0, MeCard, email (mailto with subject and body), SMS, phone, geo, calendar event (VEVENT, with a visible note that phone support varies and a link to "use an event page instead").

**Encoding controls:** error correction L/M/Q/H (default M; auto-raised to H when a logo or halftone image is present), minimum version, mask pattern (advanced panel, auto by default), quiet zone in modules (default 4; warning below 4), encoding mode auto.

**Style controls:** foreground and background colours with a contrast check (warn under 4:1; warn when inverted, light on dark), dot shape (square, rounded, dots), corner square and corner dot styles, optional linear or radial gradient, centre logo (raster upload that stays in the browser; size slider capped at 25% of area, warning above 20%; optional white knockout behind the logo), frame with call-to-action text ("Scan to RSVP", "Scan for menu", custom).

**Artistic (halftone) mode:** blend a background image into the module grid, function patterns kept solid, data modules drawn as centred dots over the image, error correction forced to H, decode verification required before download is enabled. Three tones: colour, black and white, and silhouette, which reduces the picture to ink and paper at an adjustable cut so a logo or an icon comes out as crisp blocks; seven built-in shapes (WiFi, heart, star, arrow, map pin, envelope, tick) load as silhouettes in one click.

**Sizing calculator:** input the intended print width (mm, cm, in) or the intended scan distance; output the module size, the minimum recommended width, the maximum reliable scan distance, and plain-language warnings. Standalone page as well as a panel in the generator.

**Exports:** SVG (with `width`/`height` in mm and a single merged path), PDF (vector, CMYK 100% K black for the default colours, page sized to the code plus margin), EPS (hand-written PostScript), PNG at a chosen DPI with the pHYs chunk set, copy PNG to clipboard. A "print test sheet" PDF with the same code at 15, 20, 30, 50 mm so people can test-scan before ordering signage.

**Bulk:** CSV or pasted list (one payload per line, optional label column). Generates in a Web Worker, downloads a ZIP of SVG or PNG, or lays out onto a label-sheet PDF (Avery 5160, 5163, 5395, A4 L7160 to start; geometry verified against Avery's own templates before shipping).

**Dynamic mode (shelved 2026-09-05; the button is removed from the export panel and the copy on /never-expires, /compare, and /privacy no longer promises it, while the return leg stays):** a "Make it editable and trackable" button. Explains that this requires a free SignUpCity account, opens SignUpCity's link creation with the payload prefilled, and returns with the short URL to encode. Scan stats live in SignUpCity. StoneQR stores nothing.

**Marketing pages:** home (the generator), `/never-expires` (the policy and the story), `/print-size`, `/wifi`, `/vcard`, `/event`, `/bulk`, `/compare` (a factual comparison table against the expiring-code sites), `/open-source`, `/privacy`.

### Later (not v1)

- SVG logo embedding (v1 accepts raster only).
- QArt bit steering (Russ Cox, 2012): choose the padding codewords so the data region itself draws a one-bit picture, with the whole error-correction budget intact. Researched 2026-09-03 (`docs/research/artistic-qr.md` sections 4 and 7): no JavaScript implementation exists, `@paulmillr/qr` already exposes the template, the placement order with the mask, and the linear data-to-codeword map, so a padding-only module is about 300 to 400 lines plus tests; URL and text only; worth it at ECC L or M and a denser version (a 30-byte URL at version 10, ECC M, steers about half the data region), poor at H. Gate before any interface work: a spike that decodes on three phones at ECC M, version 10, from a 50 mm print. Reference implementation is BSD-3, so a port carries its notice.
- Micro QR and rectangular Micro QR via bwip-js (phone camera support is inconsistent; needs a scan matrix first).
- Animated or GIF halftone.
- A "save my designs" feature using browser storage only (no accounts).
- A JSON API or CLI built on the engine package.
- Localisation (the sizing copy and payload labels are the bulk of the strings).

### Never

- Accounts, email capture, or paywalls on StoneQR itself.
- Server-side generation of user payloads.
- Ads, affiliate upsells, or hand-offs to third-party QR vendors.

---

## 4. Architecture

Everything is a static site. The only network calls are loading the page and, in dynamic mode, redirecting the user to SignUpCity.

```
Browser
  ├─ apps/site (SvelteKit, adapter-static, prerendered routes)
  │    ├─ generator UI (Svelte 5 runes, no global store beyond a single design state object)
  │    ├─ Web Workers for bulk generation and halftone PNG export (render + encode, with progress)
  │    └─ lazy chunks: styled renderer, halftone renderer, PDF/EPS exporters, bulk/labels
  └─ packages/engine (@stoneqr/engine, pure TypeScript, no DOM dependency except in the canvas renderers)
       ├─ encode()      wraps the QR encoder; returns matrix + version + ecc + function-pattern mask
       ├─ payloads/     URL, text, WiFi, vCard, MeCard, mailto, sms, tel, geo, VEVENT encoders
       ├─ render/svg    matrix -> single-path SVG string with mm dimensions
       ├─ render/styled matrix -> SVG with dot/corner styles, gradients, logo, frame
       ├─ render/halftone  matrix + image -> canvas (browser only)
       ├─ export/pdf, export/eps, export/png (pHYs)
       ├─ sizing        module size, scan distance, contrast, logo coverage
       ├─ verify        decode a rendered raster and compare with the payload
       └─ labels        Avery geometry table and layout helper
Hosting: Cloudflare Workers static assets (free, unlimited requests) on stoneqr.app; deploy via wrangler like the other static sites.
```

### Library choices (from the research; see `docs/research/qr-technical.md`)

| Need | Choice | Why |
|---|---|---|
| Encoder | `uqr` (Nayuki port, ~4 KB, exposes the matrix, ECC/version/mask controls, runs anywhere) | Small, correct, no DOM. Alternative: `@paulmillr/qr`, which also decodes. |
| Decoder for verification | `@paulmillr/qr` decode, fallback `jsQR` | Verify every download at two scales. |
| Styled rendering | `@liquid-js/qr-code-styling` (maintained fork; SVG output; dot and corner styles, gradients, logo), browser only, lazy-loaded. The CTA frame is our own SVG wrapper around the library's output: its BorderPlugin draws a stroke ring with text on a path and sizes the text as the whole code in proportional mode, which is not a label band. | The original `qr-code-styling` has had no release in over a year. It re-encodes internally, so pass the same ECC and version and read the module count from its output for the sizing math. |
| Halftone | Own renderer over the `uqr` matrix (~150 lines) | No maintained JS library does segno-style halftone. |
| PDF | `pdf-lib` (stable, supports CMYK fills) | jsPDF is the alternative; pdf-lib's API is cleaner for rect drawing. |
| EPS | Hand-written PostScript (~40 lines) | No dependency. |
| PNG DPI | Hand-written pHYs chunk insertion (~30 lines with CRC32) or `png-chunk-phys` | Excalidraw does the same. |
| Bulk | `papaparse`, `fflate` | CSV and ZIP in the browser. |
| Labels | `pdf-lib` with an in-repo Avery geometry table | `@pdfme/generator` is the alternative if templates get complex. |
| Avoid | `@qr-platform/qr-code.js` (commercial license), `sharp`, `node-canvas`, `jsdom` | Not free or not browser-friendly. |

---

## 5. Engine design (`packages/engine`)

Public API sketch; names are proposals.

```ts
encode(payload: string, opts: { ecc: 'L'|'M'|'Q'|'H'; minVersion?: number; maxVersion?: number; mask?: number|'auto' })
  -> { matrix: boolean[][]; size: number; version: number; ecc: Ecc; functionMask: boolean[][] }

payloads.url(u) / .text(t) / .wifi({ssid, password, auth, hidden}) / .vcard({...}) / .mecard({...})
        / .mailto({to, subject, body}) / .sms({to, body}) / .tel(n) / .geo({lat, lng}) / .vevent({...})
  -> string   (each with input validation and escaping; each with fixtures from real phones)

renderSvg(matrix, { moduleMm, quietZone, fg, bg })            -> string
renderStyled(matrix, styleOptions)                             -> Promise<string>   // lazy, browser
renderHalftone(matrix, functionMask, image, { dotScale })      -> Promise<HTMLCanvasElement>  // lazy, browser

sizing.moduleMm(widthMm, size, quiet)                          -> number
sizing.maxScanDistanceM(widthMm)                               -> number
sizing.minWidthMmForDistance(distanceM, safety = 1.25)         -> number
sizing.contrastRatio(fg, bg)                                   -> number
sizing.assess({ widthMm, size, quiet, fg, bg, inverted, logoAreaRatio, ecc }) -> Warning[]  // plain-language strings

verify(raster: ImageData | Blob, expectedPayload: string)      -> Promise<{ ok: boolean; decoded?: string }>

exportPdf(svgOrMatrix, { widthMm, marginMm, cmyk: boolean })   -> Uint8Array
exportEps(matrix, { widthMm })                                  -> string
exportPng(canvas, { dpi })                                     -> Blob   // with pHYs
labels.sheets                                                  -> Record<string, SheetGeometry>
labels.layout(items, sheetId)                                  -> Uint8Array (PDF)
```

Design rules for the engine:
- Pure functions where possible; anything touching `document`, `canvas`, or `Image` lives under `render/` and `export/` and is imported lazily by the site.
- Every payload encoder and the sizing math have unit tests with fixtures.
- The function-pattern mask (finders, separators, timing, alignment, format and version info, dark module) is computed from the version, tested for versions 1, 2, 7, 14, 25, 40.

---

## 6. Sizing math (the feature nobody else does well)

```
N          = 17 + 4 * version                 // modules per side
total      = N + 2 * quiet                    // quiet zone default 4
module_mm  = width_mm / total
warn       if module_mm < 0.4                 // widely used floor; DENSO WAVE's printer floor is far lower, phones need more
good       if module_mm >= 0.5
max_scan_m = width_mm / 100                   // 10:1 rule (code width ≈ distance / 10)
min_width_mm(distance_m) = distance_m * 100 * 1.25    // 25% safety for poor light and angles
```

Additional assessments:
- Quiet zone below 4 modules: warn.
- Contrast ratio (WCAG formula) below 4:1: warn. Note that scanners use red light, so red-on-white fails even when contrast looks fine.
- Inverted (light on dark): warn that older Android and dedicated scanners often fail.
- Logo area ratio above 20%: warn; above 25%: block (ECC H tolerates 30% in theory, not in print).
- A 40-byte URL at ECC L fits version 3 (29 modules) but needs version 4 or 5 at ECC H (33 to 37 modules); the panel shows what raising ECC does to the minimum print size, live.

Copy examples the panel should produce:
- "At 30 mm, each module is 0.91 mm. Safe. Reliable to about 0.3 m."
- "For a lobby sign read from 2 m, print at least 250 mm wide."
- "At 15 mm this code's modules are 0.36 mm, below the 0.4 mm floor. Shorten the content, lower error correction, or print at 18 mm or more."

---

## 7. Halftone algorithm

1. Encode at ECC H. Raise `minVersion` so the symbol has at least about 1,000 modules (version 7 or higher) when an image is present, so the picture reads.
2. Compute the function-pattern mask for that version.
3. Draw the image, cover-fitted to the data area (inside the quiet zone), with optional greyscale and contrast stretch controls, plus zoom (0.5× to 3×, 1× = cover-fit) and a position offset so a non-square picture can be cropped to the part that matters. The placement math is shared by the raster and the SVG export. An optional silhouette cut (a luminance threshold, 0.05 to 0.95, default 0.5, applied after contrast and before the fade) reduces the picture to the two module colours on the source pixels, before resampling, so the edge stays crisp; this is the whole of the "shape made of blocks" look (research in `docs/research/artistic-qr.md`). The SVG export reproduces the cut with a steep `feComponentTransfer` ramp and a two-entry colour table on the original picture, so the vector matches the verified raster.
4. Function-pattern cells: solid dark or light. Data cells: a centred dot at `dotScale` of the module width (default 0.4) in dark or light, leaving the image visible around it.
5. Render at 8 px per module for verification.
6. Verify with the decoder. On failure: try `dotScale` 0.5, then dim the image 20%, then tell the user which adjustment to make (bigger dots, lighter image, shorter content).
7. Export as PNG (raster, rendered and encoded in a Web Worker with a progress readout; capped at 4096 px per side since the source picture is at most 1024 px) and as a two-layer SVG (embedded image plus dot layer) for people who want to scale it. The renderer is a separable bilinear resample with the source composited and colour-adjusted once, so a 17-megapixel raster takes about 200 ms.

Reference implementation for offline comparison: Python `segno` with `qrcode-artistic`, which uses the same "centre third of each module" idea.

---

## 8. Payload encoders

Follow the ZXing "Barcode Contents" conventions.

- **WiFi:** `WIFI:T:WPA;S:<ssid>;P:<password>;H:true;;`. Escape `\ ; , " :` with a backslash, backslash first. `T` is `WPA`, `WEP`, or `nopass`. Validate SSID length (32 bytes) and warn on non-ASCII.
- **vCard 3.0:** `BEGIN:VCARD`, `VERSION:3.0`, `N:Last;First;;;`, `FN`, `ORG`, `TITLE`, `TEL;TYPE=CELL`, `TEL;TYPE=WORK`, `EMAIL`, `URL`, `ADR;TYPE=WORK:;;street;city;region;postal;country`, `END:VCARD`, CRLF line endings, no PHOTO (it explodes the version). 3.0 rather than 4.0 for phone compatibility.
- **MeCard:** `MECARD:N:Last,First;TEL:...;EMAIL:...;URL:...;;`, escaped the same way; offered as the compact option with a note that it holds fewer fields.
- **Email:** `mailto:a@b?subject=...&body=...` URL-encoded. **SMS:** `sms:+15555550100:message` with `SMSTO:` as an alternative toggle. **Tel:** `tel:+15555550100`. **Geo:** `geo:lat,lng`.
- **Event:** `BEGIN:VCALENDAR VERSION:2.0 BEGIN:VEVENT SUMMARY DTSTART (UTC, Z) DTEND LOCATION DESCRIPTION END:VEVENT END:VCALENDAR`. Show the compatibility note.
- Every encoder has fixtures captured from real phones (iPhone Camera, Android Camera, Google Lens) and a decode test.

---

## 9. Site, routes, and SEO

| Route | Purpose | Search intent |
|---|---|---|
| `/` | The generator, URL type preselected | "qr code generator", "free qr code generator no sign up" |
| `/never-expires` | The policy, the story of the expiring-code trap, and how static codes work | "qr code generator that doesn't expire", "free qr code no expiration" |
| `/wifi` | Generator with WiFi preselected and a short explainer | "wifi qr code generator" |
| `/vcard` | Generator with vCard preselected | "vcard qr code generator", "business card qr code" |
| `/event` | Generator with event preselected, with the compatibility note | "calendar event qr code" |
| `/bulk` | Bulk and label sheets | "bulk qr code generator", "qr code labels avery" |
| `/print-size` | Standalone sizing calculator | "how big should a qr code be", "qr code size calculator" |
| `/logo` | Generator with logo panel open | "qr code with logo free" |
| `/photo` | Generator with the Photo QR panel open, built-in shapes one click away | "photo qr code", "qr code with picture", "artistic qr code generator" |
| `/compare` | Factual table: expiry, SVG, logo, ECC control, sign-up required, ads | "qr code generator comparison", "qrcode monkey alternative" |
| `/open-source` | Repo link, license, how to verify nothing leaves the browser | trust |
| `/privacy` | Two paragraphs | trust |

All routes prerendered. Each SEO page carries a short, genuinely useful explainer under the tool (300 to 600 words) rather than filler, because that is what converts a search visit into a bookmark.

### UI notes

- Desktop: three columns (content, live preview, style and export). Mobile: single column with a sticky preview. The page heading and subheading share a row with the Basic/Advanced toggle from `lg` up so the tool starts higher on the page; below `lg` the heading takes the full width and the toggle sits under it.
- The halftone feature is named "Photo QR" in the interface; "halftone" is the technique and stays in code and research notes.
- Two control sets, Basic and Advanced, toggled above the generator and remembered in localStorage. Basic keeps content, colours, a look (five style presets that set the module and corner shapes together), logo, frame, Photo QR (upload, a draggable crop box with a zoom slider, the three tones), four named sizes, and the main downloads. The sizes are Small 25 mm (cards, stickers), Medium 50 mm (flyers, menus; the default), Large 100 mm (posters, door signs), Extra large 300 mm (banners, storefronts); each card states its reading distance from the 10:1 rule and flags itself "tight" or "too small" for the current content from the module-size floors. A width typed in Advanced appears in Basic as a selected "Custom" row. The look tiles are labelled "Preset" on the page. Colours are Code, Background, and Corners, the last following the code colour until one is chosen. The design is saved in the browser as you go (localStorage for settings and text, IndexedDB for the two pictures) with a "Start over" control, and "Copy a link to this design" puts the settings and content, but not the pictures, in the URL fragment for sharing. Basic's primary download is PNG, labelled with the pixel size it will produce; Advanced keeps SVG first. Advanced adds Photo QR's dot size, fade, contrast, and the Across and Down crop sliders, transparency, hand-set module and corner shapes under the look, gradients, scan distance, error correction and encoding, EPS, and the test sheet. A setting that is still in force but hidden by Basic is named in a one-line notice.
- While a halftone picture is blended in, the Style panel is disabled and greyed out rather than silently ignored.
- Preview re-encodes on every keystroke (sub-millisecond); verification runs debounced at 300 ms and shows a "Scannable" badge or a specific warning.
- Export panel: physical size inputs (Advanced) or the size cards (Basic), the sizing assessment (Basic hides the two informational lines the cards already cover), a "Print-safe" badge when module size is at least 0.5 mm and contrast passes, and the format buttons.
- Persistent one-liner near the download buttons: "Generated on your device. Never expires. Nothing was uploaded."
- Design: calm, print-shop feel; stone grey and a single accent; large type; no marketing chrome on the tool page.

### Dynamic mode hand-off contract with SignUpCity

- StoneQR opens `https://signupcity.app/links/new?from=stoneqr&dest=<encoded payload>&kind=qr&return=<stoneqr url>`.
- SignUpCity handles login, creates the link on the short domain under the `/q/` prefix, and redirects back to `return` with `?short=<https://su.city/q/slug>`.
- StoneQR reads `short`, sets the payload to it, and shows "This code is editable and tracked in your SignUpCity account."
- StoneQR never receives a token and stores nothing. If SignUpCity is down, the button simply links out; static generation is unaffected.

---

## 10. Repository layout

```
stoneqr/
  CLAUDE.md
  plan.md                      # this file
  docs/
    research/qr-technical.md   # library comparison, sizing sources, export details
    scan-matrix.md             # results of real-phone scan tests (created in M4)
  apps/site/                   # SvelteKit + adapter-static; wrangler.jsonc for static assets
  packages/engine/             # @stoneqr/engine (MIT), vitest, fixtures/
  package.json                 # bun workspaces
  LICENSE                      # MIT
  README.md
```

Deploy: build `apps/site`, upload the output as static assets with wrangler (the same pattern as the existing denver_trivia_zone deploy script). Custom domain stoneqr.app on Cloudflare nameservers. No Worker code needed beyond the asset config; if a Worker shell is required by the adapter, it serves assets only.

---

## 11. Milestones

Effort is in evenings, assuming Claude Code does most of the typing and Garrett reviews and tests on real devices.

1. **M1 Engine core (2 evenings):** `uqr` wrapper with matrix and function mask; URL and text payloads; single-path SVG renderer with mm dimensions; sizing math with tests; PNG export with pHYs; a minimal page that proves the loop.
2. **M2 Content types (1 to 2 evenings):** all payload encoders with fixtures; type selector UI; `/wifi`, `/vcard`, `/event` routes.
3. **M3 Style (2 evenings):** `@liquid-js/qr-code-styling` integration behind a lazy chunk; colours with contrast check; logo upload with coverage cap and knockout; frames with CTA text; decode verification badge.
4. **M4 Print exports and scan matrix (2 evenings):** PDF with CMYK, EPS, clipboard, test sheet PDF. Print the test sheet at home and scan every export at every size with iPhone Camera, Android Camera, and Google Lens. Record results in `docs/scan-matrix.md`. This doubles as marketing content.
5. **M5 Halftone (2 to 3 evenings):** function-pattern mask for all versions, renderer, verification loop, image controls, two-layer SVG export. Benchmark five images against segno's artistic output offline.
6. **M6 Bulk and labels (2 evenings):** CSV and pasted lists, Web Worker generation, ZIP download, label-sheet PDF with Avery geometry verified against Avery's downloadable templates.
7. **M7 Site and SEO (2 evenings):** all marketing routes with their explainers, `/compare` table with sources, `/never-expires` story, Open Graph images (static per route), Cloudflare Web Analytics, README and LICENSE, publish `@stoneqr/engine` to npm.
8. **M8 Dynamic hand-off (1 evening, after SignUpCity's links exist):** the button, the return flow, the policy text.
9. **M9 Silhouette and shapes (1 evening, built 2026-09-03):** the engine's threshold option and `prepareImage`, the Silhouette tone with its Cut slider in Basic, seven built-in shapes, the matching SVG filter, the `/photo` route with its card, and silhouette rows in the scan matrix.
10. **M10 UI refresh (built 2026-09-04):** shared control primitives including an in-page colour picker that replaces the operating-system colour window, the Style panel rebuilt around drawn swatches and grouped sections, section headers with collapsed summaries, a phone layout with content first and a pinned preview bar, the Size and download and Photo QR panels regrouped, then the same primitives on `/bulk` and `/print-size`, plus one site-wide focus ring and disabled treatment. Design contract and per-phase notes in `docs/ui-refresh.md`. A second pass the same day (§8c there) unified the Basic and Advanced size vocabulary, gave the drawn choices arrow-key navigation and switch semantics, moved export errors inline, added a skip link, and removed the Basic-to-Advanced flash on load; style presets followed as drawn "Look" tiles (§8d), and Photo QR gained a draggable crop box that is the engine's placement run backwards (§8e). Verifying the flash fix live exposed a deploy hazard: Pages served `index.html` with a 200 for a not-yet-replicated chunk and `_headers` cached it for a year, so the site now prerenders `/404` and `deploy.sh` polls every hashed asset before it reports success. Still to do on hardware: check the pinned bar and the actual-size preview on a real phone.
11. **M11 Saved designs and share links (built 2026-09-05):** the look tiles are labelled "Preset"; the colours are Code, Background, and Corners, the corners following the code colour until one is chosen and every contrast check using the weaker of the two; the design persists in the browser as you work (localStorage for settings and text, IndexedDB for the two pictures, restored before first paint) with a "Start over" link in the Content heading; and "Copy a link to this design" puts the record, defaults dropped, in the URL fragment as deflated base64url JSON. The preview stage stays white so a coloured background no longer spills past the code or outside the frame. The SignUpCity hand-off is shelved the same day, its return leg left dormant. Notes in `docs/ui-refresh.md` §8f.
12. **M12 Saved designs and offline (built 2026-09-05):** any number of named designs, pictures included, in IndexedDB (`lib/generator/saved.ts`, database version 2), opened from "Save" / "Saved (n)" in the Content heading: save, update, save as new, open (asks when it would replace unsaved work), rename, delete, and a `.stoneqr.json` file out and back in for copies that outlive the browser's storage. The site is an installable PWA with a service worker that precaches the app and every prerendered page, so the whole generator works offline. Notes in `docs/ui-refresh.md` §8g.

Launch after M7. M8 can follow.

---

## 12. Test plan

- **Unit (vitest):** payload encoders against fixtures; sizing math; function-pattern mask for versions 1, 2, 7, 14, 25, 40; pHYs chunk bytes; SVG path merging; EPS bounding box; label geometry sums (columns times pitch plus margins equals sheet width).
- **Decode tests:** every export format is rasterised and decoded in CI; halftone samples decode at 8 px and 3 px per module.
- **Real-device scan matrix:** the printed test sheet, three phones, all formats and sizes, recorded in `docs/scan-matrix.md` and repeated whenever a renderer changes.
- **Visual regression:** a few golden SVGs compared byte-for-byte to catch renderer drift.
- **Performance:** initial JS budget check in CI (core path under 150 KB gzipped); bulk of 500 codes completes in under 10 seconds on a mid-range laptop.
- **Accessibility:** keyboard-only pass through the generator; labels on every control; preview has an alt description of the payload type.

---

## 13. Launch and distribution

The QR audience is broad, so this launch looks different from SignUpCity's.

1. **Search first.** The route list in section 9 is the launch plan. Each page is a real tool plus a real explainer. Target long-tail queries where the top results are blog listicles rather than tools: "doesn't expire", "no sign up", "without ads", "size calculator", "avery labels".
2. **Hacker News.** "Show HN: StoneQR, a QR generator that can't expire because it never sees your data" with the Trustpilot and BBB facts in the first comment. This grievance has reached the front page before on its own.
3. **Reddit.** r/smallbusiness, r/weddingplanning, r/Teachers, r/eventplanning, r/ExecutiveAssistants: answer the recurring "which QR generator won't expire" question with the tool, not an ad.
4. **The scan matrix as content.** "We printed our codes at five sizes and scanned them with three phones; here is what worked" is a link-worthy page and a trust signal.
5. **Open-source channels.** npm package, GitHub topics, a small entry on awesome-lists for QR and Svelte.
6. **Cross-link.** SignUpCity share panels offer a StoneQR code; StoneQR's footer says "by the makers of SignUpCity."

Success in the first 90 days: 5,000 codes generated (counted client-side as a single anonymous page event, no payload data), three of the SEO routes on page one for a long-tail query, one external article or forum thread recommending it unprompted, zero support requests about a code that stopped working.

---

## 14. Costs

| Item | Cost |
|---|---|
| Hosting (Cloudflare static assets) | $0, unlimited requests |
| Domain stoneqr.app | about $15 to 20 a year (qrstone.app optional) |
| Cloudflare Web Analytics | $0 |
| npm publishing | $0 |
| Maintenance | low: no server, no accounts, no PII; the risks are library updates and phone-camera behaviour changes |

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| A styled or halftone code looks great and does not scan in print | Mandatory decode verification before download; the print test sheet; the scan matrix; conservative defaults. |
| `@liquid-js/qr-code-styling` diverges from `uqr` on version selection | Read module count from its output; pin versions; golden tests. |
| Avery geometry is wrong and 300 labels misprint | Verify against Avery's PDF templates; ship a "print one sheet first" note; offer a calibration page. |
| SEO head terms are owned by funded vendors | Long-tail routes and the explainers; the "never expires" angle is the one they cannot copy without changing their business model. |
| Someone forks the public repo and runs a copy with ads | Expected and acceptable; the brand, domain, and scan-matrix content are the moat. MIT is the deliberate choice. |
| Phones change how they handle VEVENT or Micro QR | Keep the compatibility notes honest; re-run the scan matrix yearly. |

---

## 16. Open questions for Garrett

1. **Alternate spelling:** buy qrstone.app as well, or accept the risk?
2. **Halftone in v1 or v1.1?** It is the most distinctive feature and the most work (M5). Launch could happen after M4 with halftone following; the plan above launches after M7.
3. **Label sheets:** which Avery numbers do you actually use at work? The starting four are guesses.
4. **Design direction:** "print-shop calm" is the proposal. Any brand colours or references you want it to match?
5. **Package name:** `@stoneqr/engine` needs the `stoneqr` npm organisation, which is free to create.

---

## 17. Next steps when building starts

1. Register stoneqr.app (Garrett).
2. `git init`, add LICENSE (MIT), README, this plan, `CLAUDE.md`.
3. Scaffold the workspace: `apps/site` (SvelteKit, adapter-static, TypeScript), `packages/engine` (TypeScript, vitest).
4. M1.
