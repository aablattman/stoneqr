# Centre logos: what is built, what is wrong, and the plan for SVG

Written 2026-09-05 after rendering the logo path through `renderStyled` on the dev server with a
round PNG, a wide wordmark PNG, an SVG with a viewBox, and an SVG without one, at every slider
value, on a version 3 (29-module) code and a version 13 (69-module) code. The pictures are in the
session's scratchpad as `logo-as-rendered.png`; the numbers below are what the library wrote into
the `<image>` element.

## 1. What the logo does today

The feature is the classic "logo in the middle, modules removed under it". It is not Photo QR:
the library's `center` image mode leaves out every module inside a centred rectangle, draws the
picture there, and keeps the finder patterns. That part works. Three things around it do not.

### 1a. The size slider is not the size it says

`Design.logoSize` (0.15 to 0.5, default 0.35) is passed straight to the library as
`imageOptions.imageSize`, and the site reports `logoSize²` as "% area". But the library's
`imageSize` is not a fraction of the width. In `center` mode it is a coefficient of the
error-correction budget:

    maxHiddenDots = floor(imageSize × eccFraction × dataModules)
    dataModules   = n² − 192 − 2(n − 16) − alignmentPatterns² × 25     (n = modules per side)

The hole is then the largest odd-sided square (margin included) whose module count fits, capped
at `n − 14` per axis. Measured, margin 1:

| Code | slider | site readout | hole (modules) | logo (modules) | logo width | true area |
|---|---|---|---|---|---|---|
| v3, 29 | 0.15 | 2% area | 3 × 3 | 1 × 1 | 3% | 1% |
| v3, 29 | 0.25 | 6% | 5 × 5 | 3 × 3 | 10% | 3% |
| v3, 29 | 0.35 (default) | 12% | 7 × 7 | 5 × 5 | 17% | 6% |
| v3, 29 | 0.45 | 20% (warn) | 7 × 7 | 5 × 5 | 17% | 6% |
| v3, 29 | 0.50 (max) | 25% (block edge) | 7 × 7 | 5 × 5 | 17% | 6% |
| v13, 69 | 0.35 | 12% | 21 × 21 | 19 × 19 | 28% | 9% |
| v13, 69 | 0.50 | 25% | 25 × 25 | 23 × 23 | 33% | 13% |

So on a short URL the top half of the slider does nothing, the bottom end produces a one-module
dot, and the default logo is smaller than the "logo QR" people expect (those run 25 to 30% of the
width). The 20% warning and 25% block in `sizing.ts` fire on a number the renderer never
produces; the real ceiling is `0.5 × 0.30 = 15%` of the data modules, which is safe, but the
readout, the warnings, the `/logo` copy ("capped at a quarter of the area"), the hint under the
slider, and the scan-matrix row C description all describe a cap that is not what is printed.

### 1b. "Clear space behind the logo" does nothing

`styled.ts` maps the switch to `imageOptions.fill`. In this library `fill` is only read when
`imageOptions.mode` is `background` (it colours the light dots under a background picture). In
`center` mode the modules are removed whether the switch is on or off; the SVG output is
byte-identical either way. Scan-matrix row L6 ("knockout off, the logo painted straight over
modules") therefore tested the same thing as row C.

### 1c. SVG is closer than the code admits

The library already handles an SVG data URL: `drawImage` decodes a
`data:image/svg+xml;base64,` string, parses it, and appends the `<svg>` element itself (with
`overflow="visible"`) instead of an `<image>`. That keeps the logo vector in the SVG export. Two
things bite:

- Size comes from `new Image()`; an SVG with no `viewBox` and no width/height reports 300 × 150,
  the hole is cut for that aspect, and the drawing overflows into the modules (the purple case
  in the rendering). That is the "disturbed by the modules" look.
- Nothing is sanitised or scoped: `<script>`, `<foreignObject>`, `on*` handlers, external
  `href`s, and `id`s that collide with the library's own `mask-dot-color` / gradient ids all go
  straight into the preview (`{@html}`), the exported file, and the decode raster.

Everything downstream is already indifferent to the picture format: `persist.ts` and `saved.ts`
accept any `data:image/` URL (`isPicture`), the `.stoneqr.json` file carries it as a string, the
`DropTile` thumbnail is an `<img>`, and PNG, raster PDF, the test sheet, and the decode check all
go through `svgToCanvas`, which draws the whole SVG through an `<img>`; a nested `<svg>` with only
internal references rasterises fine there.

## 2. Plan

Three phases. The first fixes the logo as it stands and is a prerequisite: an SVG logo inherits
the size lie and the dead switch, and the copy has to be rewritten once anyway.

### Phase 1: honest size, working knockout — built 2026-09-05

Done as written, with two deviations, both recorded in `docs/ui-refresh.md` §8h:

- **The default width is 20%, not the 24% planned.** On the densest common case, a short URL on a
  version 3 code, 24% lands on a nine-module logo that hides 15.5% of the budget and so opens the
  panel on a warning. 20% lands a tread lower and is comfortable.
- **The margin slider is hidden when the clear space is off**, because the library forces the
  margin to nought in `overlay` mode; a slider that did nothing is what this phase was fixing.

The port was checked against 162 live renders (three versions, three aspect ratios, three margins,
six widths) with no mismatch, and `bun run scan-sheets` was rerun: every row still decodes, and
the C and L6 rows now print what their captions say.

1. **Replace `logoSize` with `logoWidth`**, the logo's width as a fraction of the code's width
   (excluding the quiet zone). Slider 0.10 to 0.32, step 0.01, default 0.20. New persisted key;
   `logoSize` is dropped from `PERSISTED` so an old saved 0.35 does not come back as 35%.
   `apply` already ignores unknown keys. Update `persist.test.ts` and the defaults there.
2. **Port `calculateImageSize`** (about twenty lines, MIT) into `apps/site/src/lib/logo-size.ts`
   as `predictHole({ coefficient, modules, alignments, margin, aspect })` returning
   `{ hideX, hideY, logoW, logoH }`, and `coefficientFor(logoWidth, …)`: step the coefficient up
   from 0.01 until the predicted logo reaches the target width, clamp to 1. `renderStyled` passes
   that coefficient. Pin the port with the table above (both versions, margins 0 and 1, the wide
   aspect) in `apps/site/test/logo-size.test.ts`; those numbers came from the real library, so a
   library update that changes the formula turns the test red.
3. **Truthful readouts.** `Design.logoCover` = hidden data modules ÷ data modules (what the
   error correction actually loses), `Design.logoAreaRatio` = hole area ÷ symbol area. Slider
   readout: "24% of width" in both sets; Advanced adds "· 6% area · 13% of the data". Follow
   `docs/ui-refresh.md`: numbers stay in Advanced, Basic keeps one plain figure.
4. **Engine rule.** `assess`/`summary` take `logoCover` instead of `logoAreaRatio`: warn above
   0.15 ("H can rebuild 30% in theory; print, glare, and cheap lenses take the rest"), block
   above 0.20. `LOGO_WARN_RATIO` / `LOGO_BLOCK_RATIO` become `LOGO_WARN_COVER` /
   `LOGO_BLOCK_COVER`; `sizing.test.ts` follows. The site's `logoBlocked` uses the same.
5. **Knockout.** On: `center` mode, as now. Off: the library's `overlay` mode, which paints the
   logo over the modules without removing any (it forces margin 0). That is what the switch and
   scan row L6 claim already. The decode check is the safety net; the summary line names it
   ("Logo · over the modules") so the collapsed panel is honest. Drop `imageOptions.fill`.
6. **Copy** that quotes 20% / 25% of the area: `/logo` page, the slider hint, the ECC ticket
   ("Forced to H while a logo is present"), the export lock message ("Shrink the logo below 25%
   of the area"), README, `docs/ui-refresh.md` §8 (add §8h), and the row C heading in
   `docs/scan-matrix.md`. Add the 30% figure to `docs/claims.md` with its source (ISO/IEC 18004
   Table 12 gives the H recovery capacity as about 30% of codewords).

### Phase 2: SVG logos — built 2026-09-06

Done, with four deviations, all recorded in `docs/ui-refresh.md` §8i:

- **`<style>` blocks are inlined onto their elements and the block dropped**, rather than having
  their classes prefixed. SVG style rules are document-wide, so a prefixed block would still have
  restyled the page around the preview; inlining uses the browser's own selector engine, which
  gets Illustrator and Figma exports exactly right. Class attributes are stripped with it, so a
  logo carrying `class="hidden"` cannot be swallowed by the site's own CSS.
- **The root keeps a `width` and `height` matching the viewBox** instead of having them stripped,
  so every browser reports one intrinsic size and our aspect measurement agrees with the
  renderer's. The renderer overwrites both when it places the logo.
- **The drawing is clipped to its viewBox**, because the renderer sets `overflow="visible"` and
  art drawn past its own box would otherwise cross the modules.
- **A design file is treated as untrusted**, which the plan did not cover: `SavedDesigns` rebuilds
  an SVG logo out of a `.stoneqr.json` exactly as an upload, and `fromFile` refuses an SVG in the
  Photo QR slot. That hole predated SVG support, since the renderer keys on the data URL.

Verified with `bun run logo-fixtures` (eight fixtures plus three refusals, each prepared, checked
for anything active or remote, then placed in a real code and decoded) and by uploading a hostile
SVG through the real tile: nothing executed, the page's own styling was untouched, the export
carried no script or external reference, the logo's `mask-dot-color` was renamed, and the PNG and
framed PDF paths both rasterised and decoded.

### Phase 2 as planned

1. **Accept** `image/svg+xml` on the Logo `DropTile` only (Photo QR needs pixels; it keeps
   refusing SVG with its current message). Keep the 2 MB limit. The tile's note becomes
   "PNG, JPEG, WebP, or SVG".
2. **`apps/site/src/lib/logo-svg.ts`**, loaded with a dynamic import from the upload handler so
   the core chunk does not grow. `prepareSvgLogo(text): { dataUrl, width, height, notes[] }`:
   - Parse with `DOMParser` as `image/svg+xml`; refuse on `parsererror` or a non-`svg` root.
   - Remove `script`, `foreignObject`, `animate*`, `set`, `<a>` (unwrap), every `on*` attribute,
     any `href` / `xlink:href` that is not `#id` or `data:`, `<image>` and `<use>` with external
     references, and `<style>` rules containing `@import` or a non-data `url(`.
   - Establish a size: keep a `viewBox`; else build one from `width`/`height` (px, pt, mm, in);
     else append the element to an offscreen `<svg>` in the document, `getBBox()`, and set the
     viewBox to that; else refuse ("This SVG has no size. Add a viewBox and try again").
     Strip `width`/`height` from the root so the library's `x/y/width/height` win.
   - Scope: prefix every `id`, every `url(#…)`, every `href="#…"`, and every class used in a
     `<style>` block with `lg-`, so a logo from Illustrator (`.cls-1`) or Figma (`clip0`) cannot
     collide with the library's `mask-dot-color`, the frame, or a second design on the page.
   - Note `<text>` ("Text in an SVG logo uses whatever font the viewer has; convert it to
     outlines first") and show it under the tile like an error but in the info style.
   - Serialise with `XMLSerializer` and return `data:image/svg+xml;base64,…`. The library only
     inlines the base64 form; a `charset=utf-8,` URL falls back to an `<image>` and loses the
     vector.
3. **Rendering**: nothing changes in `styled.ts`. Check the nested `<svg>` in the frame wrapper
   (`frameSvg` only rewrites the outer root, so it is unaffected) and in `styled-pdf.ts`.
4. **Persistence**: no change. `isPicture` accepts the data URL; IndexedDB and the design file
   carry it. Share links never carry pictures, as today.
5. **Tests**: the pure helpers (`viewBoxFrom`, `prefixIds`, `scopeStyles`, `toDataUrl`) in
   `apps/site/test/logo-svg.test.ts` on strings. The DOM half has no vitest home (no jsdom in
   this repo, by rule), so it is checked in the browser against fixtures in
   `apps/site/test/fixtures/logos/`: an Illustrator export with classes, an Inkscape file with
   its namespaces, a Figma export with `clip0` ids, one with no viewBox, one with a `<script>`,
   and one with `<text>`. The check is a script step, not a memory: `scripts/logo-fixtures/`
   as a Bun server plus page like `bun run og` (`--headless` drives Chrome unattended, which is
   how CI runs it), rendering each fixture through `renderStyled` and asserting the output
   decodes and contains no `<script`, `on*=`, or external `href`.

### Phase 3: proof on paper — sheets built 2026-09-06, print outstanding

The printable half is done and the copy was already rewritten during phases 1 and 2. What is left
needs a printer and a phone, which is Garrett's half.

- **`bun run scan-sheets` now builds 48 codes on 14 pages**, up from 44. New: `C3`, the widest
  logo the site allows (27% of the width, hiding 16%, past the warning on purpose); and section
  `M`, SVG logos through the real `prepareSvgLogo` path at 30 and 50 mm plus a wide wordmark.
  `L6` finally paints a logo over the modules, which the switch could not do before phase 1.
- **Logo captions print the measurements**: how wide the logo came out and how much of the code it
  hides, so a sheet can be scored without going back to the screen.
- **The sheet resolves `'widest'` itself** with `fitLogo`, because the answer depends on how many
  modules the payload produced; hard-coding a width would have made C3 mean something different
  on every content change.
- **The row IDs are checked against `docs/scan-matrix.md`** on every build, and the command now
  exits non-zero if they have drifted or a code fails its decode. That rule used to live only in
  prose in `CLAUDE.md`; it was verified by deliberately renaming a row and watching the build
  report it in both directions.
- **The SVG rows draw the same fixtures `bun run logo-fixtures` checks**, served from
  `apps/site/test/fixtures/logos/`, so the sheet and the test cannot disagree about the art.

Still owed, and only a person with a printer can do it: print at 100% on the laser, scan `C3`,
`L6`, `M1`, `M2` and `M3` on the Pixel 10 Pro and an iPhone, and record them. `C3` is the row that
matters most, because the 15% warn and 20% block are extrapolation until something past the
warning line has been printed and scanned. A colour print is still owed for `L2` and `L8`.

### Phase 3 as planned

1. Reprint the scan sheets: row C at the new default and the new maximum, row L6 as a real
   overlay test, and two new rows: an SVG logo (vector path) and a wide wordmark. Keep the
   `SECTIONS` list in `scripts/scan-sheets/page.ts` in step with the doc.
2. Record on the Pixel 10 Pro and, when available, an iPhone.
3. Rewrite the `/logo` page's "Why logos work at all" paragraph around data-module cover, and
   add a line that SVG logos stay vector in the SVG download.

### Later, not in this pass

- Rasterise a dropped SVG to 1024 px through a canvas so Photo QR's Silhouette can take one; the
  silhouette is how a logo becomes crisp blocks, and it would be odd for `/photo` to refuse a
  file `/logo` accepts.
- A round or rounded knockout. The library only clears a rectangle; a shaped hole means drawing
  the modules ourselves, which is the same work as leaving the library.

### Phase 4: the crop, and the slider that steps — built 2026-09-12

Not in the original plan. Garrett found the Size slider "pretty much unusable" (four live
positions on a version 3 code, the rest dead travel) and asked for a zoom and crop bounded to
the blank space. Recorded in `docs/ui-refresh.md` §8m: the Size slider is now one position per
reachable tread (`logoTreads`), the crop box on the logo is the blank space itself, free in
shape and bounded to the picture, the hole follows the crop's shape, and the renderer receives
the cropped picture (a canvas PNG for a raster, a clipped vector wrapper for an SVG). Rows C4 and
M4 joined the sheet; the "later" item about a shaped knockout stands.

## 3. Risks and decisions

- **Library semantics.** The port in `logo-size.ts` is pinned to measured values, so a
  `@liquid-js/qr-code-styling` bump that changes `calculateImageSize` fails a test instead of
  silently resizing every saved design.
- **Nested `<svg>` in editors.** Illustrator and Inkscape both import nested `svg` elements
  (Inkscape as a group). Affinity does too. This is the same structure the frame wrapper
  already emits, so nothing new is being asked of the print shop.
- **Fonts in SVG logos.** `<img>` rendering never loads web fonts, so `<text>` falls back for
  PNG, PDF, and the decode check. The note at upload is the fix; outlining is the designer's
  normal habit.
- **Overlay mode is easier to break.** A dense logo over modules with margin 0 will fail the
  decode check sooner. That is the feature working; the copy says so.
- **Old saved designs.** Dropping `logoSize` means a saved logo comes back at the new default
  width rather than at a mistranslated value. Say so in the M13 line.
