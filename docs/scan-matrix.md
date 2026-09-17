# Scan matrix

Real-phone results for every kind of code the generator makes, at the sizes people print. Repeat whenever a renderer changes (plan §12). The results double as marketing: "we printed every style at every size and scanned it with these phones" is a claim no competitor makes.

## How to run it

1. **Build the sheets.** From the repo root run `bun run scan-sheets --headless` (or `bun run scan-sheets` and open the URL it prints in any browser) and wait for "Done". It writes `docs/scan-sheets.pdf` (ignored by git; about 2 MB, 15 pages). Pass `-- --photo ~/Pictures/some.jpg` to use a real photograph for the Photo QR rows instead of the painted stand-in; note which you used in the results.
2. **Print** on plain paper at 100% scale, never "fit to page". A laser print is the baseline. If you have an inkjet, print a second copy later and record it as a second pass; inkjet dot gain is what turns silhouette dots grey.
3. **Check the print** with a ruler: A4 (50 mm) should measure 50 mm across the quiet zone. If it does not, the printer scaled the page.
4. **Three phones**, the default camera app on each, plus Google Lens on one of them. Write the model and OS version in the column headers below. The interesting spread is one recent iPhone, one recent Android, and one older or cheaper Android.
5. **Distance**: hold the phone about ten times the code's width away (a 30 mm code from 30 cm, a 50 mm code from 50 cm) in ordinary indoor light, and give it three seconds. That is the 10:1 rule the size copy is built on. If it fails, move closer and try again; that is a ~ (scanned after moving), not a ✅.
6. **Score** on the last two pages of the PDF while standing, then copy the results here. Every URL code opens `stoneqr.app/?s=<ID>`, so the phone tells you which code it read; for the content types (J) write down what the phone offered to do.
7. **Extra large (K4)** is tiled over the last four pages. Trim along the grey hairline on the inner edges, butt-join the four tiles on a table or wall, and scan from about 3 m.

The build also checks that the row IDs it printed match the ones in this file and exits non-zero
if they have drifted, so a result can never be written against the wrong code.

Legend: ✅ scanned first try · ~ scanned after moving or changing the light · ❌ did not scan · – not tested

### What the next print owes us

The sheet built on 2026-09-12 carries nine codes no phone has seen. Everything else already has a
Pixel 10 Pro column from 2026-09-05.

- **C3**, the widest logo the site allows: 27% of the width, hiding 16% of the code, which is past
  the warning line on purpose. This is the row that says whether the 15% warn and 20% block are
  set in the right place; they are extrapolation until it is scanned.
- **L6**, a logo painted straight over the modules. Its 2026-09-05 tick does not count: the
  knockout switch was a no-op then, so that print was a second copy of C1.
- **M1, M2, M3**, SVG logos through the real upload path, the last a wide wordmark that should sit
  in a wide hole.
- **N1 to N4**, the built-in logo icons (added 2026-09-12): the everyday WiFi case, the thinnest
  icon at the widest size, an icon in navy on the Rounded preset, and one at business-card size.

A colour print is still owed for L2 (red ink) and L8 (the light end of a gradient), which the
black-and-white laser could not test.

Each table's IDs match the labels printed under the codes. The "software" column is the engine's own decode check on the file, copied from the sheet, so a phone failure can be told apart from a bad file.

## A. Plain black on white (ECC M, version 2 URL)

| ID | Size | Modules | Software | iPhone (model, iOS) | Android (Pixel 10 Pro, Android 16) | Google Lens | Notes |
|---|---|---|---|---|---|---|---|
| A1 | 15 mm | 0.45 mm | ✅ | – | ✅ | – | below the site's 0.5 mm "good" floor |
| A2 | 20 mm | 0.61 mm | ✅ | – | ✅ | – | |
| A3 | 30 mm | 0.91 mm | ✅ | – | ✅ | – | |
| A4 | 50 mm | 1.52 mm | ✅ | – | ✅ | – | |

## B. Styled: the Rounded preset

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| B1 | 20 mm | ✅ | – | ✅ | – | |
| B2 | 30 mm | ✅ | – | ✅ | – | |
| B3 | 50 mm | ✅ | – | ✅ | – | |

## C. Logo at the default width, ECC H, clear space on

The size the generator opens on: 20% of the code's width. The rule changed on 2026-09-05 from an
area figure the renderer never actually produced to the share of the code the logo hides (warn
above 15%, block above 20%). Each caption on the sheet prints both figures for the code above it.

C1 and C2 carry ticks from the 2026-09-05 print, taken under the old sizing; they hid about the
same share of their codes then as now, so the ticks are indicative rather than current. C3 is the
widest logo the site will still let you download, which on these codes hides 16% and so sits in
the amber band on purpose.

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| C1 | 30 mm | ✅ | – | ✅ | – | logo 21% wide, hides 11%. Ticked under the old sizing; reprint to confirm |
| C2 | 50 mm | ✅ | – | ✅ | – | logo 21% wide, hides 11%. Ticked under the old sizing; reprint to confirm |
| C3 | 30 mm | ✅ | – | – | – | logo 27% wide, hides 16%: the widest the site allows, and past the warn line |
| C4 | 30 mm | ✅ | – | – | – | the same PNG cropped through the crop box (zoomed 1.6× on the mark), logo 21% wide, hides 11%: the raster crop path, re-encoded through a canvas |

## D. Inverted (white on black)

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| D1 | 30 mm | ✅ (on the negative) | – | ✅ | – | plan expects older Android to fail; note the OS version |

## E. Framed (call-to-action band, plain modules)

The frame sits outside the quiet zone; the print width is the code, the artwork is 8% wider and 21% taller. Check the label is legible and the code still reads at the small size.

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| E1 | 20 mm | ✅ | – | ✅ | – | |
| E2 | 30 mm | ✅ | – | ✅ | – | |

## F. Photo QR, colour, dot size 0.4 (version 7)

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| F1 | 30 mm | ✅ | – | ✅ | – | 0.57 mm modules, so the dots are about 0.23 mm |
| F2 | 50 mm | ✅ | – | ✅ | – | |

Picture used on 2026-09-05: painted stand-in, printed in greyscale on a black-and-white laser. The Photo QR decode geometry does not depend on hue, but a colour print of a real photo is still owed.

## G. Silhouette: built-in shapes, cut 50%

A silhouette puts most of the dark modules inside solid ink regions, where only the light dots carry information; blur or a small print turns those dots grey first.

G3 is the first row with a shape colour of its own (M14). Only the ink between the dots changes: the dots stay the code colour, so what is being asked is what a mid-tone shape costs the light dots that sit in it. White on that blue is 4.9:1, where white on black is 21:1. The synthetic decoder is no help here — it decoded a silhouette at every grey from 0 to 255, including a shape the same colour as the code — so a phone is the only thing that can answer it. Needs a colour print.

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| G1 | 30 mm | ✅ | – | ✅ | – | light dots inside the ink arcs are the weak point |
| G2 | 50 mm | ✅ | – | ✅ | – | |
| G3 | 30 mm | ✅ | – | – | – | heart in `#3a6fc4`, dots black; untested on a phone, needs a colour print |

## H. Silhouette from a logo with a coloured background

The StoneQR mark, cut at 50%. An uploaded logo follows the same path.

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| H1 | 50 mm | ✅ | – | ✅ | – | |

## I. Photo QR zoomed 2× and shifted 25% (busy crop)

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| I1 | 30 mm | ✅ | – | ✅ | – | |
| I2 | 50 mm | ✅ | – | ✅ | – | |

## J. Content types (30 mm, plain)

Here the question is what the phone offers, not only whether it reads. Write the prompt you saw ("Join network", "Add contact", "Add to calendar", or just the raw text).

| ID | Type | Version | Software | iPhone | Android | Google Lens | What the phone offered |
|---|---|---|---|---|---|---|---|
| J1 | WiFi (WPA, hidden off) | 2 | ✅ | – | ✅ | – | |
| J2 | vCard 3.0 | 9 | ✅ | – | ✅ | – | |
| J3 | MeCard | 5 | ✅ | – | ✅ | – | |
| J4 | mailto with subject | 4 | ✅ | – | ✅ | – | |
| J5 | sms: with ?body= | 2 | ✅ | – | ✅ | – | |
| J6 | SMSTO: | 2 | ✅ | – | ✅ | – | |
| J7 | tel: | 2 | ✅ | – | ✅ | – | |
| J8 | geo: | 2 | ✅ | – | ✅ | – | |
| J9 | VEVENT | 12 | ✅ | – | ✅ | – | 0.41 mm modules at 30 mm; record which phones offer "Add to calendar" |

## K. Basic size tiers (plain URL)

The four widths Basic offers. Scan each from the distance its card promises ("up to about"), in ordinary indoor light. A ✅ backs the copy on the card; a ❌ means the tier's distance text in `apps/site/src/lib/generator/sizes.ts` needs softening (change the rule in `maxScanDistanceM`, not the words).

| ID | Tier | Width | Promised distance | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|---|
| K1 | Small | 25 mm | 25 cm (10 in) | – | ✅ | – | a vCard at this width is flagged "too small" by the card on purpose |
| K2 | Medium | 50 mm | 50 cm (20 in) | – | ✅ | – | the default |
| K3 | Large | 100 mm | 1 m (3 ft) | – | ✅ | – | |
| K4 | Extra large | 300 mm | 3 m (10 ft) | – | ✅ | – | tiled over four Letter pages; trim and butt-join |

## L. Stress: the risky things the site allows with a warning

A ❌ here is data, not a bug. It tells us whether the warning copy is strong enough, or whether a warning should become a block.

| ID | What | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|---|
| L1 | Grey ink `#7a7a7a` on white, contrast 4.3:1 (floor is 4:1) | 30 mm | ✅ | – | ✅ | – | a laser's grey is a dither of black dots, so this also tested a screened tint |
| L2 | Red ink `#a3301d` (the site warns about red-light scanners) | 30 mm | ✅ | – | – | – | not yet tested: the 2026-09-05 print was a black-and-white laser, so the red came out as dark grey. Needs a colour print |
| L3 | Tiny: 10 mm, 0.30 mm modules (floor is 0.4 mm) | 10 mm | ✅ | – | ✅ | – | |
| L4 | Dense: long vCard, version 16, 0.34 mm modules | 30 mm | ✅ | – | ~ | – | the site calls this "tight"; Pixel 10 Pro needed 2 to 3 seconds, the only code that hesitated |
| L5 | Dots preset at ECC L | 30 mm | ✅ | – | ✅ | – | |
| L6 | Logo at the widest, painted over the modules | 30 mm | ✅ | – | – | – | **awaiting a phone.** The 2026-09-05 print used the knockout switch while it was a no-op, so that row was really a second C1. The sheet built 2026-09-06 paints the logo over the modules for the first time |
| L7 | Photo, smallest dots 0.25, no fade | 30 mm | ✅ | – | ✅ | – | if the fallback ladder had to step in, the sheet's caption says so |
| L8 | Gradient from near-black to a light teal `#5aa896` | 30 mm | ✅ | – | ✅ (greyscale print) | – | the light end is about 2.6:1 against white. A greyscale print keeps the luminance, so the contrast part of the test holds; the colour itself is untested |
| L9 | Quiet zone of 1 module | 30 mm | ✅ | – | ✅ | – | |
| L10 | Inverted Dots preset (white dots on black) | 30 mm | ✅ (on the negative) | – | ✅ | – | |
| L11 | Leaf preset (classy shapes) | 30 mm | ✅ | – | ✅ | – | |
| L12 | Silhouette Heart, cut 25% (thin shape) | 30 mm | ✅ | – | ✅ | – | |

## M. SVG logos, rebuilt on upload

The same mark as row C, uploaded as SVG and put through `prepareSvgLogo`, plus a wide wordmark to
check the hole follows the picture's shape rather than assuming a square. The sheet prints a
raster of each, as every styled row does; that an SVG stays vector in the SVG download is checked
by `bun run logo-fixtures`, not here.

New on 2026-09-06 and not yet on paper.

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| M1 | 30 mm | ✅ | – | – | – | logo 21% wide, hides 11%; square hole |
| M2 | 50 mm | ✅ | – | – | – | logo 21% wide, hides 11%; square hole |
| M3 | 30 mm | ✅ | – | – | – | wide wordmark, logo 27% wide, hides 7%; the hole is wide and short |
| M4 | 30 mm | ✅ | – | – | – | the wordmark cropped to a square around its mark through the vector wrapper, logo 21% wide, hides 11%; the hole should be square, and none of the rest of the wordmark may show |

## N. Built-in logo icons

The icons under the logo tile, added 2026-09-12. Each is drawn by `logo-icons.ts` in the code
colour and placed unprepared, exactly as the Logo panel places it, on the clear space. That every
icon decodes in software at 20% and at the 32% maximum is already checked by
`bun run logo-fixtures`; these rows are the paper and the phones. N4 is also a legibility check: at
20 mm the icon is about 3.5 mm across, so note whether a person still reads it as a calendar.

Not yet on paper.

| ID | Size | Software | iPhone | Android | Google Lens | Notes |
|---|---|---|---|---|---|---|
| N1 | 30 mm | ✅ | – | – | – | WiFi icon, logo 21% wide, hides 11% |
| N2 | 30 mm | ✅ | – | – | – | Menu icon at the widest the site allows, logo 27% wide, hides 16%, past the warn line; the thinnest strokes of the set |
| N3 | 30 mm | ✅ | – | – | – | Calendar icon in navy `#1a3d8f` on the Rounded preset, logo 21% wide, hides 11% |
| N4 | 20 mm | ✅ | – | – | – | Calendar icon at business-card size, logo 21% wide, hides 11%, the icon about 3.5 mm across; does the icon still read? |

## File formats opened in

Separate from the sheets: export one code in each format from the generator and open the files. This checks the files, not the print.

| Format | Illustrator | Affinity | Inkscape | Preview.app | Print shop RIP | Notes |
|---|---|---|---|---|---|---|
| SVG (mm) | – | – | – | – | – | check the artboard reads 30 × 30 mm |
| PDF (CMYK) | – | – | – | – | – | check ink is 100% K only, and that the page reads 30 × 30 mm with no margin, the same as the SVG artboard (changed 2026-09-06 from a 5 mm margin) |
| EPS | – | – | – | – | – | |
| PNG 300 dpi | – | – | – | – | – | check the DPI metadata reads 300 |
| PNG halftone, 250 mm at 600 dpi | – | – | – | – | – | capped at 4096 px per side; check the DPI metadata still reads 600 and the export did not freeze the page |
| SVG framed | – | – | – | – | – | check the artboard reads 32.4 × 36.3 mm for a 30 mm code and the label font substitutes cleanly |
| Avery 5160 labels | – | – | – | – | – | print the calibration sheet first; the codes print in the bulk page's colours and width since 2026-09-06 |

## Results log

| Date | Printer | Paper | Phones | Sheet built | Notes |
|---|---|---|---|---|---|
| 2026-09-05 | black-and-white laser (greyscale) | plain | Pixel 10 Pro, default camera | 2026-09-05, painted stand-in photo | Nearly every code tried (a few skipped, not recorded which). Everything read instantly except L4, the dense vCard, which took 2 to 3 seconds. L2 does not count (red printed as grey) and L8 counts for contrast only. Every code read from 30% to 100% farther than the size copy promises, so the 10:1 rule in `maxScanDistanceM` is conservative on a current flagship; keep it until an older or cheaper Android is in the table. |
