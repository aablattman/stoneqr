# UI refresh: cleaner, calmer, more obvious

Status: planned 2026-09-04, built 2026-09-04 (phases 0 to 5), second pass the same day (§8c). Milestone M10 in `plan.md`. What is left is on real hardware, not in the code: see §10. This is the design
contract for the refresh; the rules in `CLAUDE.md` (Basic/Advanced split, `advancedInUse`, the
hero row, "Photo QR" naming, the bundle budget, the decode check) all stay in force.

The site already has a good voice: warm paper, ink, one verdigris accent, mono "ticket" labels,
Fraunces headings, the cutting-mat grid. Nothing here replaces that. The problem is that the
panels underneath the voice were built control by control, so the generator reads as a stack of
form fields rather than a designed tool. The fix is a small set of shared primitives, then
rebuilding each panel out of them, starting with the Advanced Style section.

---

## 1. What is wrong today

Audited on the dev build at 1440 px and 375 px, Basic and Advanced.

### Style panel (Advanced) — the weakest surface

- **Shape pickers are words in boxes.** "Square, Rounded, Dots, Classy, Soft" and "Square,
  Rounded, Round, Classy" give no idea what they draw, and "Round" next to "Rounded" is a
  guessing game. Nothing on the site shows what a corner frame or a corner dot even is.
- **Segmented controls wrap badly** in the 22 rem column: "Soft" orphans onto its own row under
  Modules; Corner frames and Corner dots sit in half-width columns and break into three rows
  each with a lone "Round" at the bottom.
- **No hierarchy.** Colours, transparency, contrast readout, modules, corners, gradient, logo, and
  frame are eight blocks of identical weight in one column. The eye has nowhere to start.
- **Browser chrome leaks through.** The logo picker is the native "Choose File · No file chosen"
  control, the colour wells are native, the range sliders are native. Each one is in a different
  visual language from the paper-and-ink chrome around it.
- **Loose readouts.** "Contrast 21.0:1" floats under the Transparent checkbox with no relation to
  the colour fields it describes. The frame toggle's label needs four `!important` overrides to
  look like body text.
- **Nothing is previewed.** You cannot see a gradient, a corner style, or a frame until it has
  rendered in the big preview, and with a picture blended in the whole panel greys out with no
  memory of what was set.

### The rest of the generator

- **`<details>` accordions with a text "▶"** as the chevron; the collapsed heading tells you
  nothing about what is inside or whether anything is set (a logo, a frame, a picture).
- **Content type picker** is ten chips wrapping 4 / 4 / 2. Works, but reads as tags, not a choice.
- **Size and download (Advanced)** is one long column: width, unit, five preset chips, read-from,
  the notice, error correction, quiet zone / min version / mask, dpi, then a 2 × 2 grid of buttons
  in four different button styles (accent, ink, secondary, secondary), then two small buttons.
  The grouping is there in the code but not on the page.
- **Sliders** (logo size, margin, gradient angle, six in Photo QR) are unstyled and their label /
  slider / value columns do not align between rows.
- **Phones.** The preview card comes first, so a new visitor sees an empty card that says "type
  something in the content panel" before they see the content panel. The plan calls for a sticky
  preview on mobile; it is not sticky. The nav wraps to two lines and the hero fills most of the
  first screen before the tool appears.
- **The toggle** is labelled "CONTROLS Basic | Advanced" in a ticket, which is accurate but reads
  as a settings label rather than an invitation.

### Other pages

- `/print-size`, `/bulk`, `/compare`, `/never-expires` share the eyebrow + h1 + lede opening and
  the `.sheet` cards, which is right. `/bulk` is the densest page on the site and will benefit
  from the same section primitives as the generator; the others need only the global polish.
- The footer and header are fine on desktop. On phones the header needs a plan for seven links.

---

## 2. Design principles for the refresh

1. **One vocabulary.** Every panel is built from the same five parts: a section header, a field
   row, a swatch grid, a slider row, and a drop tile. If a control needs a sixth, the sixth is
   added to `app.css` and used everywhere, never styled inline.
2. **Show, don't name.** Any choice that changes how the code looks is picked from a drawn
   swatch, not a word. Words are captions under the swatch, in ticket type.
3. **Group by question, order by frequency.** Style is four questions: what colours, what shape,
   is there a logo, is there a frame. Size and download is three: how big, how encoded, which
   file. Each group gets a ticket header and a hairline; the most-used group comes first.
4. **Readouts sit with what they measure.** The contrast ratio belongs beside the colour pair,
   the logo percentage beside the logo slider, the module size beside the width.
5. **The collapsed state carries a summary.** A closed Style panel says "Rounded · Logo · Frame",
   a closed Photo QR panel says "WiFi shape · Silhouette", so nothing is hidden by folding.
6. **Native controls wear our clothes.** Colour wells, file inputs, and range sliders stay native
   for accessibility and keyboard behaviour, and are restyled or wrapped so they look like part
   of the sheet.
7. **Calm motion.** 120 ms colour and border transitions, the existing first-load reveal, nothing
   that moves layout. Respect `prefers-reduced-motion` as now.
8. **No new dependencies, no new chunks.** Swatch previews are inline SVG, at most a few hundred
   bytes each. The generator page stays well inside the 150 KB budget (85 KB today).

---

## 3. Primitives to add (Phase 0)

All in `apps/site/src/app.css` under `@layer components`, plus five small Svelte components in
`apps/site/src/lib/components/`. Each component is dumb: props in, events out, no `Design` import,
so the bulk page and the print-size page can use them too.

| Primitive | Where | What it is |
|---|---|---|
| `SectionHeader.svelte` | components | h2 or h3 in Fraunces, optional badge slot on the right, optional one-line summary in ticket type shown only when the section is collapsed, a real chevron icon. Replaces every `<details><summary>` and the plain `<h2 class="text-xl">` headings. |
| `.subhead` | app.css | A ticket label with a hairline rule after it: `COLOURS ————`. The grouping device inside a panel. |
| `.row` | app.css | Grid `[label] [control] [readout]` at `auto 1fr auto`, readout in `.num`, so slider rows and short field rows align down the whole column. |
| `Slider.svelte` | components | Native `<input type=range>` in a `.row`, with the track and thumb restyled (ink thumb, rule track, accent fill via `background-size` trick), label, unit, and an optional reset-to-default dot that appears when the value is not the default. |
| `ColourField.svelte` | components | A 36 px swatch button beside a mono hex input, with a "disabled" style for the Paper field when transparent is on. The swatch opens our own `ColourPopover` (below); the native `<input type=color>` is gone from the site. |
| `ColourPopover.svelte` | components | The in-page colour picker: a modal `<dialog>` anchored to the swatch, closed by a click anywhere outside, with that click swallowed. Detailed in section 3a. |
| `Swatches.svelte` | components | A fixed-column grid of square tiles (`grid-cols-5` at 22 rem), each tile holding an inline SVG drawn from a snippet, caption beneath in ticket type, `aria-pressed`, ink border when selected. Never wraps a tile onto a lonely row because the column count is fixed per group. |
| `DropTile.svelte` | components | A dashed tile, "Drop a picture here or choose a file", PNG / JPEG / WebP note, native file input inside for keyboard and click, drag-over state in accent. When a file is set it becomes a thumbnail row with the name and a Remove link. Used for the logo and for Photo QR. |
| `.toggle` | app.css | A checkbox styled as a small switch for on/off decisions that reveal more controls (frame, transparent background, blend the picture). Plain checkboxes stay for flags inside forms (hidden network, all day). |
| Icons | `lib/icons.ts` | About fourteen 16 px stroke icons as string constants: chevron, tick, warning, upload, remove, and one per content type. Inline SVG, no sprite, no library. |

Also in Phase 0: restyle the native file input and range input globally so any place the
components are not used yet still looks intentional, and replace the text "▶" everywhere.

### 3a. The colour picker

The native colour input opens an operating-system window: it floats away from the swatch, it
stays open while you click elsewhere, and on macOS it is the full Colors panel with its own tabs.
Every colour on the site (Ink, Paper, Fill "to", Frame, Frame text, and Ink and Paper on `/bulk`)
goes through `ColourField`, so replacing the native input in one component fixes all of them.

**Behaviour, in order of importance.**

1. Clicking a swatch opens a small card (about 232 px wide) directly under the swatch, left
   edge aligned, flipped above or shifted inward when it would leave the viewport.
2. Clicking or tapping anywhere outside the card closes it, and that click does nothing else:
   it does not press a button, focus a field, or select a module shape underneath.
3. Escape closes it. Focus goes back to the swatch.
4. Changes apply live while dragging, so the preview updates as you move; the preview's
   existing 60 ms style debounce absorbs the drag.
5. Scrolling or resizing the page closes it, so the card never drifts away from its swatch.

**How the click-away swallows the click.** The card is a `<dialog>` opened with `showModal()`.
The browser puts a modal dialog in the top layer and marks everything else on the page inert, so
a pointer event outside the card lands on the dialog's `::backdrop`, never on the page. The
component listens for `pointerdown` on the dialog element itself (the backdrop is part of the
dialog for hit-testing; a `pointerdown` whose target is the dialog and not a child is a backdrop
press) and calls `close()`. The backdrop is fully transparent, so the page looks unchanged while
the card is open, but it is untouchable. This is the only approach that swallows the click for
free: the Popover API's light dismiss and a `document` click listener both let the outside click
through to whatever is under it, which is exactly the complaint.

**Anatomy of the card.**

```
┌──────────────────────────────┐
│ ┌──────────────────────────┐ │   saturation / value square, 200 × 140,
│ │            ●             │ │   pointer drag, arrow keys move 1 %, shift 10 %
│ └──────────────────────────┘ │
│ ━━━━━━━━●━━━━━━━━━━━━━━━━━━━ │   hue strip: a native range, restyled, 0–360
│ [#1F6F63]      ◉ Eyedropper  │   mono hex field (live, validated), EyeDropper
│ ■ ■ ■ ■ ■ ■ ■ ■              │   swatches: ink, paper, accent, black, white,
└──────────────────────────────┘   plus the other colours currently in the design
```

- The square and hue strip work in HSV; conversion to and from hex is about 30 lines in
  `lib/colour.ts` with unit tests (round trip every swatch, the six site tokens, and the edge
  cases `#000`, `#fff`, and pure hues).
- The hex field accepts 3 or 6 digits with or without `#`, normalises on blur, and shows the
  block colour on an invalid value without changing the design.
- The eyedropper button appears only where `window.EyeDropper` exists (Chrome and Edge; Safari
  and Firefox hide it). It lets someone match a brand colour from a logo on screen.
- The swatch row always includes the site's ink, paper, and accent, black and white, and
  whichever of Ink, Paper, Fill "to", Frame, and Frame text are set in the current design, so
  matching the frame to the ink is one click.
- Keyboard: Tab order is square, hue, hex, eyedropper, swatches. The square is a `role=slider`
  pair (aria-valuetext "saturation 40 %, brightness 70 %"). The dialog traps focus by nature.
- Touch: the same card, anchored the same way, with a 44 px hit area on the square's handle. On
  screens under 480 px it is centred horizontally instead of aligned to the swatch, because a
  swatch at the column's right edge would push the card off screen.

**Sizing and dependencies.** About 180 lines of Svelte and 30 of TypeScript, no library, no lazy
chunk, roughly 2 KB gzipped, in the core generator bundle. Every browser the site supports has
had modal `<dialog>` since 2022 (Safari 15.4, Firefox 98, Chrome 37).

**Acceptance.** With the card open, clicking a module swatch, the Basic/Advanced toggle, a
download button, or a text field does nothing except close the card; a second click then acts
normally. Escape closes it and returns focus to the swatch. Dragging in the square updates the
preview live and the decode badge still settles to "Scannable". The card never renders partly
off screen at 375 px or 1440 px. Contrast readouts and the frame colours behave as before.

**Where it lands.** Phase 0, since `ColourField` is a primitive; it is exercised by Phase 1 on
the five Style colours and by Phase 5 on `/bulk`.

**Typing a colour, and what `/bulk` missed.** Manual hex entry is not an extra beside the picker,
it is the way a brand colour actually gets in: nobody drags a square to `#1f6f63`. So there are
two hex fields, the one on `ColourField` itself and the one inside the card, and both go through
`normaliseHex`, which is the whole contract — 3 or 6 digits, `#` optional, any case, normalised to
lower-case `#rrggbb` on blur, and `null` for everything else so a half-typed value sits in the
field without reaching the design. Nothing on the site may take a colour any other way. Phase 5
never converted `/bulk`, which kept the last two native `<input type=color>` on the site and,
worse, bound their hex boxes straight to `fg` and `bg`, so an unprefixed `1f6f63` reached the
encoder and the batch came out black without a word (item A7 of `docs/audit-2026-09-06.md`).
Converted 2026-09-06; the "no `<input type=color>` anywhere on the site" claim above is now true
of the code as well as the intent. A new colour control anywhere is `ColourField`, not markup.

---

### 3b. What Phase 0 settled

Built 2026-09-04. Two things came out differently from the sketch above, both measured rather
than guessed:

- **The left column stays at 22 rem.** The plan expected to widen it to 24 rem for five tiles.
  Measured at 1440 px, the five module tiles land at 59 px each on one row inside the existing
  column, and the four corner tiles at 73 px, so the column was left alone and the preview keeps
  its width.
- **`<details>` is gone from the generator.** `SectionHeader` owns a plain boolean instead, which
  removes the whole class of bug the two panels carried a comment about: Svelte merges a block's
  dynamic attributes into one effect, so `details.open = open` was reasserted whenever a sibling
  attribute changed, and ticking "Transparent background" slammed the Style panel shut.

Cost: the generator page's eagerly loaded client JavaScript went from 85.4 KB to 91.4 KB gzipped,
against the 150 KB budget. Photo QR took the new header in the same pass so the site has one
chevron; the rest of that panel is still Phase 4.

## 4. Phase 1: Style panel

The reason this refresh exists. Basic and Advanced share the same layout; Basic simply shows
fewer groups.

```
Style                                   Rounded · Logo · Frame   ⌄
──────────────────────────────────────────────────────────────────
COLOURS ─────────────────────────────────────────  21:1 print safe
[■] #000000   Ink          [□] #ffffff   Paper     (·) Transparent
Fill   ( Solid | Linear | Radial )                      Advanced
       [■] to #1f6f63   Angle ────●──── 45°

SHAPE ─────────────────────────────────────────────────────────────
Modules   [▦] [▩] [⁙] [◆] [▢]        five drawn tiles, captions under
          Square Rounded Dots Leaf Soft
Corners   Frame  [▣] [▢] [◯] [◆]      Advanced; drawn as the finder
          Dot    [■] [●] [◆]          pattern with that corner style

LOGO ──────────────────────────────────────────────────────────────
[ Drop a logo here or choose a file ]  → thumbnail · name · Remove
Size    ────●────────  14% area         readout turns warn / block
Margin  ──●──────────  1 module
(·) Clear space behind the logo

FRAME ─────────────────────────────────────────────────────────────
(·) Call to action under the code
    [ Scan for menu                ]   chips: Scan me · Scan to RSVP …
    [■] Frame   [■] Text
```

Specifics:

- **Group order** is Colours, Shape, Logo, Frame in both sets. Basic hides Fill, Corners, and
  Transparent; those keep reporting through `Design.advancedInUse` exactly as now.
- **Colours** become two `ColourField`s on one row. The contrast reading moves into the subhead's
  right slot as a badge: `21:1 · print safe` in ok green, `3.2:1 · too low` in warn. It uses the
  existing `.badge` classes so it matches the Size panel's badge. Transparent is a `.toggle` on
  the same row in Advanced.
- **Fill** (was "Gradient") is Solid / Linear / Radial. When not Solid, a second colour field
  labelled "to" and, for Linear, an angle slider appear on the next line. The hint about RGB
  printing stays.
- **Modules** is a `Swatches` group of five. Each tile draws a 3 × 3 patch of modules in that
  style (square rects, rounded rects, circles, the leaf shape, extra-rounded). The library's ids
  do not change; only the captions do: `classy` is captioned "Leaf", `extra-rounded` "Soft".
- **Corners** is one subhead with two swatch rows, Frame and Dot, each tile drawing a finder
  pattern (7 × 7) with that corner-frame or corner-dot style. Captions use one vocabulary across
  both rows: Square, Rounded, Circle, Leaf. No more "Round" beside "Rounded".
- **Logo** uses `DropTile`. Once a logo is set, the tile becomes the thumbnail row, then two
  `Slider`s (Size with the % area readout coloured by the warn and block ratios, Margin in
  modules) and the knockout toggle, reworded "Clear space behind the logo". The ECC-forced-to-H
  hint stays, one line.
- **Frame** is a `.toggle` labelled "Call to action under the code". On, it reveals the text
  input with the datalist, the six chips, and two `ColourField`s labelled Frame and Text. The
  `!important` label hack goes away because the toggle row is its own primitive.
- **While a picture is blended in**, the panel still greys out and the notice stays, but the
  collapsed summary keeps reporting what is set ("Off: photo · Rounded · Frame") so the user knows
  what comes back when the picture is removed.
- **Width.** The left column grows from 22 rem to 24 rem on `lg` and the right column shrinks to
  match, so five 40 px tiles with 8 px gaps fit with the panel padding. The preview column takes
  the remainder, as now.

Acceptance: at 1440 px no segmented control or swatch group wraps; every visual choice shows a
drawing; every readout sits on the row of the control it describes; `bun run check` and
`bun run test` pass unchanged (no renderer changes, so no golden updates); the styled and
halftone decode badges behave exactly as before.

---

## 5. Phase 2: Generator shell and Content panel

- **Section headers.** Content, Style, Photo QR, Size and download all use `SectionHeader`.
  Content is always open (no chevron). Style and Photo QR collapse with a summary. The
  `panelOpen` reasoning in the two panels (why the open state is held locally and never driven
  by the prop) moves into the component with its comment intact.
- **Content type** becomes a 5 × 2 grid of tiles, each with its 16 px icon over the label,
  selected tile in ink. Same `role=radiogroup` semantics. The description line under it stays.
- **The toggle** reads `Show  ( Basic | Advanced )` with the ticket "Show" rather than
  "Controls". The "Advanced settings still apply" notice stays but gains the chevron icon and the
  lighter `.notice-info` treatment.
- **Phones (below `lg`).** Order becomes Content, Preview, Style, Photo QR, Size and download.
  Once the full preview scrolls off screen, a compact bar pins to the bottom of the viewport: a
  56 px thumbnail of the current render, the decode badge, and the primary download button. It
  is one small component (`PreviewBar.svelte`) driven by an `IntersectionObserver` on the preview
  card and hidden at `lg` and above. This is the "sticky preview" the plan asked for, done in a
  way that does not steal the first screen.
- **Hero on phones.** The h1 clamp floor drops from 2.2 rem to 1.9 rem below `sm`, and the
  landing-page ledes are trimmed to one sentence on phones with a `hidden sm:inline` second
  sentence. The first-load reveal is unchanged.
- **Header on phones.** The nav becomes a single horizontally scrolling row with a fade at the
  right edge below `md`, so it never wraps. Desktop is unchanged. Labels stay as they are (they
  match the routes and the OG cards).
- **Preview card.** Keep the caption strip. Add a thin "actual size" toggle in the strip
  (Advanced only): when on, the preview renders at the chosen print width using CSS `mm` units
  with a 10 mm scale bar beneath, capped at the card width. It is honest about being approximate
  on high-density screens in its tooltip. Small feature, very on-brand, and it makes the size
  tiers in Basic tangible when Garrett tests on a phone held next to a printed sheet.

---

### 5b. What Phase 2 settled

Built 2026-09-04.

- **The left column is `display: contents` below `lg`.** Getting Content, Preview, Style, Photo
  QR, Size and download into that order on a phone meant the content sheet and the style sheet
  had to be separate grid items; making their wrapper `contents` on phones and `block` at `lg`
  does that without duplicating any markup. On desktop the left column is now two stacked cards
  rather than one long one, which separates what the code contains from what it looks like.
- **The pinned bar lives in ExportPanel, not beside the preview.** Its button has to be the real
  download, and the export path carries the worker, the progress readout, and the stale-chunk
  message; duplicating that for a second button would have been the wrong trade. The bar finds
  the preview card and the generator by id and watches both, so it appears once the preview
  scrolls away and hides again below the tool rather than sitting over the footer. The rendered
  Photo QR object URL moved onto `Design.halftonePreviewUrl` so the bar can show the same
  thumbnail; Preview still owns creating and revoking it.
- **Actual size is measured, not asserted.** At a 50 mm setting the preview host comes out 189 px
  wide and the scale bar 38 px, which is exactly 50 mm and 10 mm at the 96 px per inch browsers
  assume. The toggle's tooltip says so rather than implying the screen is calibrated.
- **A whitespace trap.** Wrapping the second sentence of each hero in `hidden sm:inline` with the
  joining space *inside* the span renders "expire.Vector" — Svelte trims it. The space goes
  before the span.

Cost: the generator page's eager client JavaScript went from 91.4 KB to 92.6 KB gzipped, against
the 150 KB budget.

## 6. Phase 3: Size and download panel

Same structure as Style: subheads, rows, one primary action.

```
Size and download                                   ● print safe
──────────────────────────────────────────────────────────────────
PRINT SIZE ────────────────────────────────────────────────────────
Basic:   the four tier cards, unchanged in content, restyled as rows
Advanced: Width [ 50 ] [mm ⌄]   Read from [   ] m
          Sticker 20 · Card 30 · Flyer 50 · Poster 120 · Sign 250
          ▸ At 50 mm each module is 1.52 mm. Safe. Reads to about 0.5 m.

ENCODING (Advanced) ───────────────────────────────────────────────
Error correction ( L | M | Q | H )   Survives 15%. The sensible default.
Quiet zone [4]   Min version [1]   Mask [Auto ⌄]

FILES ─────────────────────────────────────────────────────────────
[        Download SVG · vector        ]   primary, accent
[ PDF · CMYK ] [ PNG · 300 dpi ] [ EPS ]  one uniform secondary row
Copy PNG · Print test sheet · PNG resolution 300 dpi ⌄   (text row)
Generated on your device. Never expires. Nothing was uploaded.

──────────────────────────────────────────────────────────────────
Need to change it after printing?  [ Make it editable and trackable ]
```

- Basic keeps PNG as the primary button, Advanced keeps SVG, exactly as now; only the
  presentation changes. The four-style 2 × 2 grid becomes one primary and one uniform row.
- The dpi select moves out of the encoding grid and into the Files group as a small inline
  select on the text row, because it only affects the PNG.
- The sizing notices stay under Print size; the ECC hint sits on the ECC row's readout slot.
- The tier cards in Basic get the `.row` alignment for the name / size / distance so the four
  cards line up, and the "Custom" row keeps its behaviour.

---

### 6b. What Phase 3 settled

Built 2026-09-04. The panel became Print size, Encoding, Files, and the four-different-styles
button grid became one primary with a uniform row of three underneath, using a stacked button so
"PDF / CMYK" fits a 101 px cell. The dpi control moved into Files, where it belongs, since it
only changes the PNG.

Three layout bugs surfaced while measuring, all of them older than this phase:

- **The three columns started too early.** At a flat 22 rem the side columns left the preview
  about 208 px at 1024 px wide, which crushed the caption strip and broke the figures under the
  code across two lines. The side columns now hold back to 18 rem between `lg` and `xl`. Note
  that the site's root font size is 17 px, so 18 rem is 306 px and 22 rem is 374 px.
- **A section heading blew out its column.** `SectionHeader` is a grid item inside the panel's
  grid, so its automatic minimum was its min-content — "Size and download" plus a 7 rem status
  badge, about 312 px — which pushed the whole sheet past its 306 px track and the page into a
  horizontal scroll. The heading now carries `min-w-0` and wraps rather than truncates, so the
  badge drops to its own line instead of the title being ellipsised.
- **The caption strip ran out of room** once it held a label, the Actual size toggle, and the
  decode badge. The 10 mm scale bar moved into the preview area, beside the artwork where it
  reads better anyway, and the "Preview" label is screen-reader-only between `lg` and `xl`.

Cost: 92.6 KB to 92.7 KB gzipped, against the 150 KB budget.

## 7. Phase 4: Photo QR panel

- `DropTile` for the picture, with the seven shapes beneath it as a `Swatches` group (they are
  already tiles; they become the same tile as everywhere else).
- Crop: the three sliders become `Slider` rows so Zoom / Across / Down align, with the reset
  dot on each when moved. Later (not this refresh): a draggable crop box on a thumbnail.
- Look: Dot size, Fade, Contrast as `Slider` rows in Advanced; the tone as a three-tile
  `Swatches` group (a colour, a grey, and a black-and-white silhouette of the same tiny sample)
  in place of the segmented control, since the choice is visual. Cut stays a slider with Paper
  and Ink end labels; the percentage readout stays Advanced-only.
- The two explanatory paragraphs at the bottom become one, with the second sentence in the
  collapsed summary instead ("PNG or SVG").

---

## 8. Phase 5: The other pages and global polish

- `/bulk`: apply `SectionHeader`, `.subhead`, `.row`, and the restyled selects and file input;
  the three cards keep their order. The results table gets the `.prose table` treatment.
- `/print-size`: already close; adopt `Slider` for scan distance beside the number field, and the
  same result badge as the generator.
- `/compare`, `/never-expires`, `/open-source`, `/privacy`: no layout change. Global polish only.
- Global: consistent focus rings (`outline` in accent on every interactive element, not only
  segmented buttons); disabled states at 45 % opacity everywhere; `.notice` gains a 16 px icon
  slot; button heights unified at 40 px (`btn`) and 32 px (`btn-sm`); table rows in `/compare`
  get a hover tint; the footer's three columns collapse to two on `sm`.
- Print stylesheet: hide the toggle and the preview bar as well as the header and footer.

---

### 8b. What phases 4 and 5 settled

Built 2026-09-04.

- **Photo QR became sliders and tiles.** Crop and Look are `Slider` rows with reset dots, the
  tone is three drawn tiles of the same scene (`ToneArt`) rather than three words, and the seven
  built-in shapes wear the `.swatch` tile without captions — seven captions do not fit a 22 rem
  column, and the shapes say what they are. They stayed plain buttons rather than a `Swatches`
  group because loading a shape is an action, not a selection, and forcing radio semantics onto
  it would have been a lie.
- **A slider can have no readout.** Basic hides the Cut percentage, which left the reset dot
  announcing "Reset Cut to ". `Slider` now drops the value from its label when `format` returns
  nothing.
- **The bulk CSV picker became a drop tile**, which meant its handler had to take a `File` rather
  than a change event. Verified end to end: a synthesised CSV parses to "3 rows · 2 columns" and
  generates two codes.
- **Global polish went into `@layer base`**, so one focus ring and one disabled treatment cover
  every control, including the ones no component had thought about. Notices gained an icon
  column, `.prose-table` shares the prose table rules with the bulk preview, and control heights
  are 2.5 rem and 2 rem — 43 px and 34 px at this site's 17 px root, not the 40/32 the sketch
  assumed.
- **Two more lg-band clips**, found the same way as Phase 3's: the paired colour fields cut the
  last character off "#000000" at 306 px, and the longest swatch caption overran its tile by a
  pixel. The colour pair stacks in that band; the caption's letter-spacing came in.

Cost: 92.7 KB to 93.7 KB gzipped, against the 150 KB budget. Across all six phases: 85.4 KB to
93.7 KB, an 8.3 KB increase for the whole refresh.

## 8c. Second pass

Audited again on 2026-09-04 after the six phases had landed, at 1280 px and 375 px, Basic and
Advanced, plus the other pages. Nothing structural was wrong; what remained were seams between
the two control sets, a few places where browser defaults still showed, and keyboard gaps in the
controls that claim radio semantics.

- **One set of print sizes.** The Advanced chips were Sticker 20, Card 30, Flyer 50, Poster 120,
  Sign 250, while Basic listed 25, 50, 100, and 300. Choosing "Small" in Basic then switching
  highlighted nothing, and "Card 30 mm" in Advanced came back to Basic as "Custom". The chips now
  read from `SIZE_TIERS`, so a size chosen in either set is the chosen one in the other, and
  `sizes.ts` is the only place a width is written down.
- **Numbers stay in Advanced.** The Version / Modules / ECC / Module row under the preview, and
  the contrast ratio in the Colours badge, showed in both sets. Basic now keeps the badge's
  verdict ("clear" or "too low") and drops the figures; the size list already says what the
  module size means in words. The Photo QR closing note lost its version number in Basic too.
- **The promise line showed twice on a desktop**, under the preview and under the download
  buttons, a column apart. It is phone-only under the preview now, where it is the first
  reassurance after the code appears, and stays with the downloads everywhere.
- **The download sheet stretched** to the height of the Style column beside it, leaving a quarter
  of the card empty on a wide screen. It is `self-start` at `lg`.
- **Drawn choices take the arrow keys.** The type tiles and every `Swatches` group carried
  `role="radio"` without the behaviour that promises: every tile was a tab stop and the arrows
  did nothing. `radiogroup.ts` is a small action that moves focus and the choice with the arrow
  keys, Home, and End; the tiles carry a roving `tabindex`, so Tab lands on the chosen one.
- **Toggles announce as switches.** The five `.toggle` inputs carry `role="switch"`, so a screen
  reader says "on" and "off" rather than "checked".
- **Export failures are a notice, not an alert.** The stale-chunk explanation and any other
  export error now sit under the download buttons as a `.notice-block` with `role="alert"`,
  in the site's own type, instead of a native dialog.
- **The hand-off link is properly out of reach** when there is nothing to hand off: it was
  `aria-disabled` but still followed `#` to the top of the page. It now loses pointer events,
  its tab stop, and half its opacity.
- **A skip link.** The first Tab press on any page offers "Skip to content", ahead of the seven
  nav links, and `<main>` carries the id it points at.
- **Feet beside metres** in the Advanced "reads to about" hint, through the same `formatDistance`
  the Basic tiers use.
- **No Basic-to-Advanced flash on load.** The prerendered page is Basic, and a saved Advanced
  choice used to be applied in `onMount`, so every visit painted Basic and then rebuilt the
  panels. Now a one-line inline script in `app.html` stamps `data-mode="advanced"` on `<html>`
  before first paint, `app.css` keeps the tool and its toggle invisible (space kept) until the
  Generator sets `data-hydrated`, and the Generator reads the saved mode synchronously so its
  first client render is Advanced. Svelte 5 recovers from an `{#if}` that differs from the
  server by rendering that branch afresh, without a warning. The script's sha256 is in the CSP
  in `svelte.config.js`; the same script lifts the hold after three seconds regardless, so a
  failed or slow hydration shows the Basic tool rather than nothing. (A CSS animation was tried
  first for that release and dropped: a hidden tab never advances it.) Basic visitors see no
  change at all.
- **Found while verifying the above on the live site:** Cloudflare Pages had no `404.html`, so a
  request for a hashed asset that had not yet replicated after a deploy came back as
  `index.html` with a 200, our `_headers` rule stamped it with a one-year immutable cache
  header, and the edge and the first browser to ask kept a broken page. The site now prerenders
  `/404` so a missing path is a real 404, and `deploy.sh` polls every hashed asset (with a
  throwaway query string, so the polling can never poison the canonical cache key) until all of
  them are served, then warms them, before it says the deploy is done.

Cost: no new chunks; the generator page's eager JavaScript moved by well under a kilobyte.

## 8d. Style presets

Added 2026-09-04, the one item from §9 worth doing now that the swatches exist. A "Look" row
leads the Shape group in both control sets: five drawn tiles (Classic, Rounded, Dots, Leaf,
Soft), each the corner of a code with a finder pattern and a patch of data in that look. One tile
sets the module shape and both corner shapes together; in Basic it replaces the Modules row, and
in Advanced the Modules, Corner frames, and Corner dots rows sit under it for adjusting.

A look is matched, not stored (`Design.look` in `state.svelte.ts`, presets in `lib/looks.ts`):
the design keeps its three shapes and the tile they equal is the selected one, so a hand change
in Advanced leaves no tile selected rather than a stale one. Because Basic can now set corner
shapes through a look, `advancedInUse` reports "corner shapes" only for a combination no look
offers. The collapsed summary names the look ("Soft · Logo") and falls back to the old detail
for a custom one. Colours, the logo, and the frame are not part of a look; they are separate
decisions.

## 8e. The crop box

Added 2026-09-04, the second item from §9. The Crop group in Photo QR now leads with the picture
itself, drawn on a square stage of paper with the data area over it as a box: drag the box to
choose what shows in the code, drag its corner to zoom, or use the arrow keys and plus and minus
with the stage focused. The box is the engine's placement run backwards (`lib/crop.ts`, tested
against `imagePlacement` case by case), so what it frames is exactly what the code blends in and
no second model of the crop exists. The Zoom slider stays in both control sets; the Across and
Down sliders moved to Advanced, since the box says the same thing in a picture.

## 8f. Presets by name, corner colour, saved designs, and share links

Added 2026-09-05. Four small things from a review of the shipped generator.

- **"Preset" instead of "Look".** The tiles are what people call presets, so the row and its
  group name say Preset. Code, docs, and the `Design.look` accessor keep the word look; nothing
  else changed.
- **A colour for the corners.** The Colours group is now Code, Background, and Corners. Corners
  follows the code colour until a colour is picked ("Same as code" in the label row becomes a
  "Match code" link that puts it back), stored as `Design.cornerColor`, null when following.
  The styled renderer gives the three finder patterns that colour, solid, in place of the
  gradient; the plain renderer never sees it because a corner colour counts as a styled
  request. Sizing, the contrast badge, and the red-light warning all look at
  `Design.weakestFg`, whichever of the two colours reads worst against the background, since a
  scanner that cannot find the corners never reaches the data. "Ink" and "Paper" survive in
  prose and on `/bulk`, where they are still the print words.
- **The design is saved as you go.** `lib/generator/persist.ts` keeps every field a person set
  (`PERSISTED`) in localStorage under `stoneqr.design`, written 300 ms after the last change,
  and the two pictures in IndexedDB (`stoneqr` / `images`) so a large photo cannot overflow the
  5 MB text quota and take the rest with it. The record is read synchronously at module scope in
  `Generator.svelte`, before the first render, the same way the control set is, so the restored
  code is the first thing painted; the pictures arrive a moment later. On the first mount of a
  page load the home page keeps the saved content type; a landing page or a nav click still sets
  its own. `apply` takes only values of the right shape, so an old record or a hand-edited one
  cannot put a string where a number goes. "Start over" sits at the right end of the Content
  heading, where the work began: it appears only once something is set or typed (`pristine`
  in `Generator.svelte`, the compacted record having no keys), the heading row is its own
  height so showing it moves nothing, and it asks twice, then restores the defaults and clears
  both stores. It was first beside the Basic/Advanced toggle, which read as part of the page
  chrome rather than of the design.
- **Share links.** "Copy a link to this design" in Size and download writes the same record,
  with defaults left out, as `#1.` plus deflated (`CompressionStream`, `deflate-raw`) base64url
  JSON; browsers without it get `#0.` plain base64url. A fragment is never sent to the server,
  so the promise under the buttons holds, and the hint says what the link does carry: every
  setting and everything typed, a WiFi password included, but no pictures. On load a design
  fragment wins over the saved design, drops the saved pictures rather than attaching them to
  someone else's design, and is then removed from the address bar with `replaceState` so the
  URL does not go on describing a design that has since been edited. Only a full page load
  reads it; a same-document hash change does not.

## 8g. Saved designs by name

Added 2026-09-05. §8f keeps one design, the one being worked on. This keeps any number.

- **Where.** A "Save" link at the right end of the Content heading, beside "Start over", once
  something is set; it reads "Saved (n)" once there is a list. Both open the same card,
  `generator/SavedDesigns.svelte`, a centred modal `<dialog>` (`.modal` in `app.css`, the
  picker's surface with a tinted backdrop) for the reason the colour picker is one: a press
  outside closes it and reaches nothing underneath.
- **What is saved.** The same record the autosave and the share link use (`Saved` from
  `persist.ts`), the two pictures, a name, created and updated dates, the content type, and the
  plain single-path SVG as a thumbnail. All of it sits in IndexedDB (`lib/generator/saved.ts`;
  database version 2 adds `designs` and `designImages`, the pictures keyed `<id>/logo` and
  `<id>/halftone` so listing reads only the small records). localStorage was considered for the
  record alone and rejected: pictures would have had to stay out, and the point of saving a
  Photo QR is the photo. Record and pictures go in one transaction, so a design is saved whole
  or not at all; a refused write (quota, private mode) shows a notice in the card.
- **Which one is open.** `stoneqr.opened` in localStorage remembers the saved design the working
  one came from, with the record as it was then. The card compares that with the live snapshot:
  the button reads "Saved", "Update" once something changed, or "Save" when nothing is open, and
  "Save as a new design" forks. Opening another design replaces the working one, so it asks
  first ("Replace your current design?") unless the work is saved as it stands or there is none.
  Delete asks twice, like Start over. Rename is inline. Start over forgets which design is open.
- **Files.** "Download file" writes `<name>.stoneqr.json`: `{stoneqr: 1, name, type, record,
  logo?, halftone?}`, the pictures as data URLs. "Open a design file…" reads one back, saves it
  as a new design, and opens it; a file that is not ours is refused with a notice, `apply`
  validates every field of the record, and pictures must be `data:image/` URLs. This is the copy
  that survives a cleared browser, Safari's seven-day storage expiry for sites that are not
  installed, or a move to another device.
- **Names.** `suggestName` offers one from what was typed: the host and path of a URL, the
  network for WiFi, the person or company for a contact, the subject of an email, the summary of
  an event, falling back to the content type. Names are one line of at most 120 characters.
- **Tests.** `apps/site/test/saved.test.ts` pins the file format, the refusals, and the names.
  IndexedDB itself is exercised in the browser, not in vitest.

## 8h. The logo size that was not a size

The logo controls said one thing and did another, found by rendering the logo path and measuring
the library's own output rather than reading the code (2026-09-05, `docs/logo-plan.md` phase 1).

- **The size slider was a coefficient, not a size.** `logoSize` went straight to
  `@liquid-js/qr-code-styling` as `imageOptions.imageSize`, which is a coefficient of the
  error-correction budget: the library multiplies it by the level's recovery fraction, decides how
  many modules it is willing to hide, and cuts the largest odd-sided rectangle that fits. The
  panel meanwhile reported `logoSize²` as "% area". On a short URL the top half of the slider did
  nothing at all (0.35, 0.45 and 0.5 all produced the same five-module logo), the bottom end
  produced a single module, and the 20% warning and 25% block fired on a number no render ever
  produced.
- **The size is now a width.** `Design.logoWidth` is the logo's width as a fraction of the code's
  width, 10% to 32%, default 20%. `lib/logo-size.ts` is a port of the library's
  `calculateImageSize` plus the budget arithmetic around it, so the hole can be predicted without
  rendering; `fitLogo` searches the 100 coefficients for the one landing nearest the width asked
  for. The port is pinned in `apps/site/test/logo-size.test.ts` by numbers read out of the
  library's own SVG, and checked against 162 live renders (three code versions, three aspect
  ratios, three margins, six widths) with no mismatch.
- **The readout is the width reached, not the width asked for.** A hole is a whole odd number of
  modules, so the reachable widths are a staircase: on a 33-module code they are 9%, 15%, 21%,
  27% and 33% and nothing between. The slider moves smoothly and the readout steps. Basic shows
  the width alone; Advanced adds "· hides n%".
- **The warnings moved to cover.** `LOGO_WARN_COVER` (0.15) and `LOGO_BLOCK_COVER` (0.20) replace
  the old area ratios, and measure hidden modules against the same budget the library rations, so
  the number in the warning is the number the renderer acted on. H rebuilds about 30%, so the
  warning leaves half that in hand and the block a third. The default width was chosen so the
  densest case, a short URL on a version 3 code, does not open on a warning.
- **"Clear space behind the logo" did nothing.** It set `imageOptions.fill`, which the library
  only reads in `background` mode; in `center` mode the output was byte-identical either way. It
  is now the mode itself: on cuts the modules out (`center`), off paints the logo over them
  (`overlay`), which is what the switch and the scan matrix had been claiming. The library forces
  the margin to nought in overlay, so the Margin slider is hidden there rather than lying too.
- **Old designs.** `logoSize` left `PERSISTED` and `logoWidth` and `logoAspect` joined it, so a
  saved design comes back at the new default width rather than at a mistranslated value.
  `logoAspect` is measured from the picture itself by the Preview, so a design restored from a
  file or an older record is right as soon as the picture decodes.

## 8i. SVG logos

Phase 2 of `docs/logo-plan.md`, built 2026-09-06. The renderer already inlined an SVG data URL as
markup rather than an `<image>`, so the logo could stay vector all the way into the SVG download;
what was missing was any reason to trust the file. An uploaded SVG is a document, not a picture.

`lib/logo-svg.ts` rebuilds one before anything sees it, behind a dynamic import so it stays out of
the generator's first chunk (2.8 KB gzipped on its own). What it guarantees:

- **Inert.** Script, embedded HTML, animation elements, links, `on*` handlers, and every reference
  that leaves the file are removed. The export matters most: a browser opening an SVG directly
  runs its script, and the file goes to a print shop.
- **Self-contained.** `<style>` rules are inlined onto the elements they match, then the block and
  every `class` attribute go. SVG style rules are not scoped, so a block left in place would
  restyle the site around the preview, and a logo carrying `class="hidden"` would vanish into the
  site's own CSS. Matching uses the browser's selector engine, so an Illustrator export (`.cls-1`)
  or a Figma one lands as its author drew it. This replaces the class-prefixing the plan proposed;
  prefixing would have left the rules global.
- **Sized.** A viewBox is guaranteed: the file's own, else one built from its width and height
  converted to px, else measured with `getBBox` offscreen after sanitising, else refused. Without
  one a browser calls an SVG 300 by 150, which is exactly how a square mark ended up in a hole cut
  for a 2:1 picture with the art spilling over the modules. Contrary to the plan the root keeps a
  `width` and `height` equal to the viewBox, so every browser reports the same intrinsic size; the
  renderer overwrites both when it places the logo, so this only settles the measurement.
- **Contained.** The drawing is wrapped in a group clipped to its viewBox, because the renderer
  sets `overflow="visible"` on the logo it places and art running past its own box would otherwise
  cross the modules.
- **Scoped.** Every id and internal reference is prefixed `lg-`, so a logo carrying
  `mask-dot-color` or Figma's `clip0` cannot shadow the renderer's.

Anything changed is said plainly under the tile in the info style, not hidden: script removed,
remote references removed, style rules that could not be carried, and live text, which falls back
to whatever font the reader has.

**The other way in.** A `.stoneqr.json` design file comes off the person's disk, so `SavedDesigns`
rebuilds an SVG logo from one exactly as an upload, and `fromFile` refuses an SVG in the Photo QR
slot, which resamples real pixels and has no use for markup. Uploads and this browser's own
storage are the only other sources, and both have already been through the rebuild.

**Tests.** The string helpers are in `apps/site/test/logo-svg.test.ts`. The DOM half needs a
parser, the selector engine and layout, so `bun run logo-fixtures` runs it in a browser against
`apps/site/test/fixtures/logos/`: Illustrator classes, Inkscape namespaces, Figma clip ids, no
viewBox, art overflowing its box, a wordmark, live text, and a hostile file carrying a script, an
`onload`, a phishing link, a tracking pixel, an `@import`, a `foreignObject`, and a clipPath named
`mask-dot-color`. Each is prepared, checked for anything that can act or reach the network, then
placed in a real code and decoded. Photo QR still refuses SVG, and now says why.

## 8j. Photo QR in colour

Planned 2026-09-06. The first part, Code and Background following through, was built the same
day while closing section C of `docs/audit-2026-09-06.md`; the Shape colour is still to do. Found while auditing the logo work: the halftone renderer has
taken `dark` and `light` colours since M5 (`HalftoneOptions` in
`packages/engine/src/render/halftone.ts`, used for the dots, the function patterns, the quiet
zone, and the silhouette's ink and paper), and `imageFilter` in `lib/halftone.ts` reproduces both
in the two-layer SVG. Nothing on the site passes them. `Preview.svelte` builds the options
without a colour, the PNG worker and the SVG download copy `design.halftoneOpts` from the
preview and so inherit the gap, and `scripts/scan-sheets/page.ts` does the same. So Photo QR is
always black on white whatever Code and Background say, and the seven built-in shapes, which
exist only to be silhouettes, come out black every time. The Style panel's colours are the one
setting that could have carried over into Photo QR, and they silently do not.

The fix is in three parts, the first of which is a wiring change and the second of which is the
"apply the colour wheel to the shapes" feature.

- **Code and Background follow through.** `Preview.svelte` passes `dark` from `Design.fg` and
  `light` from `Design.bg` through `hexToRgb` in `lib/colour.ts`. The worker, the
  SVG export, the decode check, and the test sheet take the options from the preview, so one
  change reaches every path, and the decode check verifies the coloured raster rather than a
  black stand-in. Transparent background stays unavailable in Photo QR, as now: the raster has no
  alpha and the picture has to sit on something. The Colours summary in the Style panel needs no
  change, because the colours will finally mean what they say there.
- **A colour for the shape.** In the Photo QR panel's Look group, under the Cut slider and only
  while the tone is Silhouette, a `ColourField` labelled "Shape". It follows the Code colour until
  one is picked, with the same "Match code" link the Corners field has, stored as
  `Design.shapeColor`, null while following, added to `PERSISTED` so it survives a reload and
  travels in share links and design files. The engine gains `HalftoneOptions.ink`, the colour a
  silhouette's dark pixels become, defaulting to `dark`; it is read in `prepareSource` where the
  cut is applied, and nowhere else, so the dots and the function patterns keep the code colour.
  `imageFilter` gets the same option in its two-entry table, because the SVG filter must stay in
  step with `prepareSource` (the rule in `CLAUDE.md`). The field is Basic, since the colour
  picker is Basic; nothing new for `advancedInUse`. The seven shape tiles stay black, as they are
  drawings of a choice, not previews.
- **Contrast and the decode check.** A silhouette puts light dots on the shape and dark dots on
  the paper, so a shape colour that reads as paper makes the shape vanish, and a mid-tone shape
  greys out the light dots first (the weak point row G of the scan matrix already names). The
  contrast badge and the red-light warning take the shape colour into account the way they take
  the corner colour: the worst of shape against background and code against shape, through the
  same `contrastRatio`, rather than a new rule. The decode check stays the gate, and the fallback
  ladder in `halftoneWithFallback` (bigger dots, then a fade) already has the tools to rescue a
  weak combination; its note should say when it did.

Copy: the `/photo` paragraph that lists the built-in shapes says they are "already silhouettes"
and gains "in any colour"; the panel summary names the shape colour when one is set, the way the
Colours summary does. Tests: an engine test that `ink` recolours a silhouette's dark pixels and
leaves the dots alone, the `imageFilter` table pinned against it, and the `persist.test.ts`
defaults. Scan matrix: one new row, a coloured silhouette (a mid-blue heart on white at 30 mm)
in section G, which joins the colour print already owed for L2 and L8. About an evening; the
engine change is a dozen lines.

### 8j (built). What the shape colour turned out to be

Built 2026-09-07. The wiring above landed as written; the rules around it did not, because the
measurement contradicted the plan.

- **The engine.** `HalftoneOptions.ink`, resolved by `withDefaults` to `dark` when unset, read in
  `prepareSource` at the cut and nowhere else. The dots and the function patterns are untouched,
  which an engine test pins by sampling a dark data module's corner (the shape) and its centre
  (the dot) and finding two different colours. `imageFilter` takes the same option, and rather
  than pinning it against numbers typed into a test it is pinned against `prepareImage` itself,
  so the SVG filter and the raster cannot drift.
- **The control.** `Design.shapeColor`, null while it follows the code colour, with `shapeFg` as
  the bindable pair, exactly as `cornerColor`/`cornerFg` work. In `PERSISTED`, and in both
  `COLOUR_KEYS` and `NULLABLE` in `persist.ts`, so a share link cannot put `teal` in it. A
  `ColourField` labelled "Shape" under the Cut, only while the tone is Silhouette, Basic, with
  the "Match code" link. The panel summary gains "Shape colour". The seven tiles stay black.

**The shape colour does not put a scan at risk, and the plan assumed it did.** Before choosing a
threshold, a heart silhouette was rendered at every grey from 0 to 255 as the shape colour, black
code on white, and decode-checked: all eighteen samples decoded, including a shape the same colour
as the code. The reason is in the renderer — the dots are painted over the picture at full
strength, so the module pattern survives whatever happens between them. §8j had said a mid-tone
shape "greys out the light dots first" and that the badge should take it; on our own evidence it
does not, and two things follow.

- **It is not in the contrast badge.** That badge is the code's print-safety. A silhouette in the
  site's own accent teal scores 3.5:1 on the worst shape pair, so folding it in would have flipped
  a plainly print-safe black-on-white code to "Low contrast" on evidence we do not have. The badge
  was left alone; the shape has its own notice in its own panel.
- **It is judged at 3:1, not `CONTRAST_MIN`.** Under a black code on white, clearing 4:1 on both
  pairs needs the shape between about 0.15 and 0.21 relative luminance — a band so narrow that
  almost nothing lands in it, the accent teal included. A warning that fires on nearly every
  choice teaches people to ignore it. So `SHAPE_CONTRAST_MIN` is 3, which is what WCAG 1.4.11 asks
  of a graphical object, and the notice is worded as appearance ("it will read as one solid blob",
  "it will barely show") rather than as a scan risk. It names which of the two pairs failed,
  because they need opposite advice. The decode check remains the gate.

`shapeContrast` returns a ratio and which pair is worse, not a colour, because "code against
shape" is not a foreground against paper and cannot be folded into `weakestForeground`.

**What a phone still owes.** All of the above is the synthetic decoder on a clean raster. Whether
a mid-tone shape costs anything on paper at 30 mm is row `G3` of `docs/scan-matrix.md`: a heart in
`#3a6fc4`, where the light dots inside the shape are 4.9:1 against it rather than the 21:1 they
get inside black ink. It needs the colour print already owed for L2 and L8.

### 8k. The shape colour, corrected

Same day, from a bug report: set a gradient, then pick a built-in shape, and the shape came out
in the gradient's colour — with the Style panel greyed out, so it could not be taken back without
removing the picture first. Three separate faults behind one symptom, and two of the rules written
in §8j above turned out to be wrong.

- **The shape colour no longer follows the code colour.** It was modelled on `cornerColor`: null
  until picked, falling back to `fg`. But a corner colour follows the code because corners *are*
  code, and a silhouette is not; all the fallback did was let an unrelated setting reach in. With
  a gradient the reach was invisible, because the colour arriving at the shape had been chosen as
  one end of a gradient the halftone renderer ignores. `Design.shapeColor` is now a plain colour
  with its own default of black, its own memory, and no link to anything. The "Match code" link
  is gone; there is nothing to match. It is out of `NULLABLE` and stays in `COLOUR_KEYS`.
- **Code and Background are promoted out of the fieldset a photo disables.** They are the only two
  settings that mean the same thing whichever renderer is in charge — since the audit wired them
  through, they colour the picture's dots and its paper — yet they sat inside the disabled block,
  in force but unreachable, under a notice that said colours "come back when you remove the
  photo". The notice was simply false. The fieldset boundary now sits below them: Corners, the
  transparent toggle, Fill, the shapes, the logo, and the frame are disabled by a photo, and Code
  and Background stay live. Transparent no longer locks the Background field while a photo is on,
  and the picture sits on the chosen background rather than a forced white, so the live field
  means something.
- **The "code against shape" warning was wrong and is gone.** §8j had it warn when the shape
  approached the code colour. That is the classic silhouette: solid ink with the light dots
  punched through it, which is the entire point of the built-in shapes. `shapeContrast` now
  checks one pair, the shape against the paper, which is the only way a shape can fail — by
  disappearing into it. Still at `SHAPE_CONTRAST_MIN`, still appearance rather than scanning.

**What the ladder measured.** Decoupling makes one new combination reachable, and it was measured
rather than reasoned about: a shape much darker than the code colour. A black heart under an
orange `#a8551b` code drives `halftoneWithFallback` to its last rung — largest dots and a 40%
fade — where the same heart under a black code is clean at the first attempt. Every combination
still decoded; the cost is picture quality, not a failed scan. A grey sweep against that orange
code puts the cliff at roughly 0.05 relative luminance: greys 0 to 60 need rescuing, 70 and above
are clean, and every shape *lighter* than the code is clean however far apart they are. The
asymmetry is the polarity: a shape darker than its own dark dots inverts the local pattern.

No new predictive rule was added for it. The fallback ladder already detects it by decoding, says
so in plain words ("The picture is faint at this setting"), and is per-design rather than a
guessed threshold — and now that Code is editable with the picture in place, the fix is one field
away.

## 9. Out of scope for this refresh

- Dark mode. The paper look is the brand; a dark theme is a separate decision.
- ~~Style presets~~ — built, see §8d.
- ~~A draggable crop box for Photo QR~~ — built, see §8e.
- Any change to the engine, the renderers, the goldens, the exports, or the SignUpCity hand-off.
- New copy for the marketing pages beyond trimming ledes on phones.

---

## 10. Verification

Automated, every phase: `bun run check`, `bun run test` (no golden updates expected; if a golden
goes red the phase touched something it should not have), `bun run build` with the generator
page's gzipped size noted in the commit message against the 150 KB budget.

In the Browser pane, every phase: 1440 px and 375 px screenshots of Basic and Advanced with the
Style and Photo QR panels open, checked for wrapping, alignment, and layout shift while typing
(measure the preview card's `top` before and after a keystroke, as the notes in memory say).

On hardware, at the end (Garrett): open the generator on the iPhone and an Android, confirm the
preview bar appears when scrolling, download a PNG from the bar, and check the "actual size"
toggle against a printed test sheet. Add a row to `docs/scan-matrix.md` only if an export path
changed, which none should.

---

## 11. Order and effort

| Phase | Evenings | Notes |
|---|---|---|
| 0 Primitives | 1 | Lands with Phase 1 in the same session; nothing visible on its own. |
| 1 Style panel | 1 to 2 | The priority. Ship this before anything else. |
| 2 Shell, content, phones | 1 to 2 | The preview bar is the only new behaviour. |
| 3 Size and download | 1 | Presentation only. |
| 4 Photo QR | 0.5 | Mostly swapping in the primitives. |
| 5 Other pages, polish | 1 | Can be split across sessions. |

Phases 0 and 1 are one pull request. Each later phase is its own, so a regression is easy to
find. Nothing in a later phase depends on a design decision that Phase 1 does not already make.
