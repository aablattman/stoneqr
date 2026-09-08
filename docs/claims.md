# Public claims to verify before launch

Statements the site makes about other products or about physics, with where they came from and their verification status. Nothing marked "unverified" should ship in a headline; the `/compare` table phrases these as general categories for that reason.

| Claim | Where it appears | Source | Status (2026-09-02) |
|---|---|---|---|
| Trial-code sites' free codes stop working after the trial (about 14 days at qr-code-generator.com) | /never-expires, /compare | plan.md §1; vendor pricing pages | Re-check the vendor page and screenshot it |
| qr-code-generator.com sits at 1.5/5 on roughly 9,200 Trustpilot reviews and has a BBB scam-tracker entry | plan.md only (not on the site) | plan.md §1 | Do not publish numbers without a dated screenshot |
| QRCode Monkey renders codes server-side and upsells to a dynamic-code vendor; acquired 2024 | /compare | plan.md §1 | Verify the acquisition and the render path (network tab) |
| 10:1 scan-distance rule and the 25% safety margin | /print-size, sizing panel, Basic size list ("up to about 3 m (10 ft)" is derived from the rule, no safety margin) | docs/research/qr-technical.md §3 | Rule of thumb, attributed as such |
| 0.4 mm module warn floor, 0.5 mm recommended | sizing panel | docs/research/qr-technical.md §3 | Rule of thumb; no primary source |
| Scanners use red light, so red foregrounds can fail | sizing warning | docs/research/qr-technical.md §3 | Applies to laser scanners; phone cameras are RGB. Soften if the scan matrix disagrees |
| Inverted (light-on-dark) codes fail on older Android and dedicated scanners | sizing warning | docs/research/qr-technical.md §3 | [unverified]; keep behind a warning |
| Calendar (VEVENT) QR support varies by phone | /event | docs/research/qr-technical.md §5 | Confirm in the scan matrix |
| Error correction H recovers about 30% of the symbol, so a centre logo is capped below that | /logo, logo warnings, `LOGO_WARN_COVER` and `LOGO_BLOCK_COVER` in the engine | ISO/IEC 18004 gives H a recovery capacity of about 30% of codewords; the 15% warn and 20% block are our own safety margin, not the standard's | Rule of thumb on the margins; the standard's 30% is sound. The thresholds are untested above about 9% cover, which is all the scan matrix has so far |
| Avery 5160/5163/5395/L7160 geometry | engine labels | LibreOffice labels.xml, gLabels templates (see notes in `packages/engine/src/labels.ts`) | Print the calibration sheet on a real sheet |
| SignUpCity publishes a no-deactivation policy | none since 2026-09-05 (the hand-off is shelved; the claim was on /never-expires, /compare, and the export panel) | private signupcity repo | Publish the policy page before the hand-off returns |
