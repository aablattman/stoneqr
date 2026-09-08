import type { Ecc, Warning } from './types.js';

/**
 * Sizing and print-safety assessment.
 *
 * Everything here is pure arithmetic on numbers the caller already has, so the panel can
 * re-run it on every keystroke. Formulas come from `plan.md` section 6 and
 * `docs/research/qr-technical.md` section 3.
 */

/** Below this module size (mm) phones start to struggle: warn. */
export const MODULE_MM_WARN = 0.4;
/** At or above this module size (mm) the code is comfortable: recommended. */
export const MODULE_MM_GOOD = 0.5;
/** Minimum WCAG contrast ratio between foreground and background. */
export const CONTRAST_MIN = 4;
/**
 * How much of the code a centre logo hides, as a fraction of the modules error correction is
 * rationed against (see `logo-size.ts` on the site for the budget). Level H can rebuild about
 * 30% of the symbol, so these leave half the budget in hand at the warning and a third at the
 * block: print, glare, a bent flyer, and a cheap phone lens all spend from the same allowance.
 */
export const LOGO_WARN_COVER = 0.15;
/** Hidden fraction above which the code is treated as unprintable and downloads are locked. */
export const LOGO_BLOCK_COVER = 0.2;
/** Safety factor on the 10:1 scan-distance rule, for poor light and off-axis reads. */
export const SCAN_SAFETY = 1.25;

/** Length units the UI offers. */
export type LengthUnit = 'mm' | 'cm' | 'in';

const MM_PER_UNIT: Record<LengthUnit, number> = { mm: 1, cm: 10, in: 25.4 };

/** Convert a length in `unit` to mm. */
export function toMm(value: number, unit: LengthUnit): number {
	return value * MM_PER_UNIT[unit];
}

/** Convert a length in mm to `unit`. */
export function fromMm(mm: number, unit: LengthUnit): number {
	return mm / MM_PER_UNIT[unit];
}

/**
 * Size of one module in mm.
 * `size` is modules per side (17 + 4 * version); `quiet` is the quiet zone in modules per side.
 */
export function moduleMm(widthMm: number, size: number, quiet = 4): number {
	const total = size + 2 * quiet;
	if (total <= 0) return 0;
	return widthMm / total;
}

/** The 10:1 rule: a symbol scans reliably out to about ten times its own width. */
export function maxScanDistanceM(widthMm: number): number {
	return widthMm / 100;
}

/** Printed width needed to scan from `distanceM`, including the safety factor. */
export function minWidthMmForDistance(distanceM: number, safety = SCAN_SAFETY): number {
	return distanceM * 100 * safety;
}

/** Smallest printed width that keeps modules at or above the given floor. */
export function minWidthMmForModule(size: number, quiet = 4, moduleFloorMm = MODULE_MM_WARN): number {
	return (size + 2 * quiet) * moduleFloorMm;
}

/* ------------------------------------------------------------------ colour */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE = /^rgba?\(\s*([^)]+)\)$/i;

/**
 * Parse a CSS colour to `[r, g, b]` in 0..255, or `null` when it is not one we understand.
 * Accepts `#rgb`, `#rrggbb`, `#rrggbbaa` (alpha ignored) and `rgb()` / `rgba()`.
 */
export function parseColor(hex: string): [number, number, number] | null {
	const input = hex.trim();

	const hexMatch = HEX_RE.exec(input);
	if (hexMatch) {
		const body = hexMatch[1]!;
		if (body.length === 3) {
			const r = body[0]!;
			const g = body[1]!;
			const b = body[2]!;
			return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
		}
		return [
			parseInt(body.slice(0, 2), 16),
			parseInt(body.slice(2, 4), 16),
			parseInt(body.slice(4, 6), 16)
		];
	}

	const rgbMatch = RGB_RE.exec(input);
	if (rgbMatch) {
		const parts = rgbMatch[1]!
			.split(/[,/\s]+/)
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
		if (parts.length < 3) return null;
		const channels: number[] = [];
		for (let i = 0; i < 3; i++) {
			const raw = parts[i]!;
			const isPercent = raw.endsWith('%');
			const n = Number.parseFloat(isPercent ? raw.slice(0, -1) : raw);
			if (!Number.isFinite(n)) return null;
			const value = isPercent ? (n / 100) * 255 : n;
			channels.push(Math.min(255, Math.max(0, Math.round(value))));
		}
		return [channels[0]!, channels[1]!, channels[2]!];
	}

	return null;
}

/** WCAG 2 relative luminance of an sRGB triple. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
	const lin = (c: number): number => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio, 1..21. Returns 1 when either colour cannot be parsed. */
export function contrastRatio(fg: string, bg: string): number {
	const a = parseColor(fg);
	const b = parseColor(bg);
	if (!a || !b) return 1;
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const lighter = Math.max(la, lb);
	const darker = Math.min(la, lb);
	return (lighter + 0.05) / (darker + 0.05);
}

/** True when the modules are lighter than the background, i.e. an inverted code. */
export function isInverted(fg: string, bg: string): boolean {
	const a = parseColor(fg);
	const b = parseColor(bg);
	if (!a || !b) return false;
	return relativeLuminance(a) > relativeLuminance(b);
}

/**
 * True when the foreground is dominated by red.
 *
 * Scanners illuminate with red light, so red modules reflect almost as much as white paper
 * and can read as blank even when the WCAG contrast looks fine. The rule is deliberately
 * simple: red high, green and blue both low.
 */
export function isReddish(fg: string): boolean {
	const c = parseColor(fg);
	if (!c) return false;
	const [r, g, b] = c;
	return r > 150 && g < 100 && b < 100;
}

/* --------------------------------------------------------------- formatting */

/** Format a width in mm: one decimal, with a bare integer when the decimal is zero. */
export function formatMm(n: number): string {
	const s = n.toFixed(1);
	return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Module sizes get two decimals; the difference between 0.39 and 0.41 matters. */
function formatModuleMm(n: number): string {
	return n.toFixed(2);
}

/** Distances get one decimal. */
function formatM(n: number): string {
	return n.toFixed(1);
}

/* ------------------------------------------------------------------ assess */

/** In print, a transparent or missing background is the paper, which we treat as white. */
export function paperColor(bg: string | undefined): string {
	if (!bg) return '#ffffff';
	const b = bg.trim().toLowerCase();
	return b === 'transparent' || b === 'none' ? '#ffffff' : bg;
}

export interface SizingInput {
	/** Printed width of the whole symbol including the quiet zone, in mm. */
	widthMm: number;
	/** Modules per side, excluding the quiet zone (17 + 4 * version). */
	size: number;
	/** Quiet zone in modules per side. Default 4. */
	quiet?: number;
	/** Dark colour. Default '#000000'. */
	fg?: string;
	/** Light colour. Default '#ffffff'. */
	bg?: string;
	/**
	 * Modules hidden by a centre logo, as a fraction of the error-correction budget, 0..1.
	 * This is what the code is asked to rebuild, not the logo's share of the picture.
	 */
	logoCover?: number;
	/** Error-correction level in use. Default 'M'. */
	ecc?: Ecc;
	/** Whether a logo is placed over the code. Defaults to `logoCover > 0`. */
	hasLogo?: boolean;
	/** The distance the code needs to be read from, in metres. */
	scanDistanceM?: number;
}

const LEVEL_ORDER: Record<Warning['level'], number> = { block: 0, warn: 1, info: 2 };

/**
 * Assess a printed size and colour scheme and return plain-language warnings,
 * ordered blocks first, then warns, then infos.
 */
export function assess(input: SizingInput): Warning[] {
	const {
		widthMm,
		size,
		quiet = 4,
		fg = '#000000',
		logoCover,
		ecc = 'M',
		scanDistanceM
	} = input;
	const bg = paperColor(input.bg);
	const hasLogo = input.hasLogo ?? (logoCover ?? 0) > 0;

	const out: Warning[] = [];
	const mm = moduleMm(widthMm, size, quiet);
	const width = formatMm(widthMm);

	// Module size.
	if (mm < MODULE_MM_WARN) {
		const need = Math.ceil(minWidthMmForModule(size, quiet, MODULE_MM_WARN));
		out.push({
			level: 'warn',
			code: 'module-size',
			message: `At ${width} mm this code's modules are ${formatModuleMm(mm)} mm, below the ${MODULE_MM_WARN} mm floor. Shorten the content, lower error correction, or print at ${need} mm or more.`
		});
	} else if (mm < MODULE_MM_GOOD) {
		const need = Math.ceil(minWidthMmForModule(size, quiet, MODULE_MM_GOOD));
		out.push({
			level: 'info',
			code: 'module-size',
			message: `At ${width} mm each module is ${formatModuleMm(mm)} mm, above the ${MODULE_MM_WARN} mm floor but small. Print at ${need} mm or more to reach the recommended ${MODULE_MM_GOOD} mm.`
		});
	}

	// Scan distance: always a summary line, plus a warning when it is too small for the job.
	const verdict = mm >= MODULE_MM_GOOD ? 'Safe.' : mm >= MODULE_MM_WARN ? 'Tight.' : 'Too small.';
	out.push({
		level: 'info',
		code: 'scan-distance',
		message: `At ${width} mm, each module is ${formatModuleMm(mm)} mm. ${verdict} Reliable to about ${formatM(maxScanDistanceM(widthMm))} m.`
	});
	if (scanDistanceM !== undefined && scanDistanceM > 0) {
		const need = minWidthMmForDistance(scanDistanceM);
		if (widthMm < need) {
			out.push({
				level: 'warn',
				code: 'scan-distance',
				message: `For a code read from ${formatM(scanDistanceM)} m, print at least ${Math.ceil(need)} mm wide. At ${width} mm it is reliable to about ${formatM(maxScanDistanceM(widthMm))} m.`
			});
		}
	}

	// Quiet zone.
	if (quiet <= 0) {
		out.push({
			level: 'block',
			code: 'quiet-zone',
			message:
				'This code has no quiet zone. Many scanners never lock on without a clear margin; leave 4 modules of background on every side.'
		});
	} else if (quiet < 4) {
		out.push({
			level: 'warn',
			code: 'quiet-zone',
			message: `The quiet zone is ${quiet} module${quiet === 1 ? '' : 's'}. The standard is 4, and below that some scanners miss the edge of the code.`
		});
	}

	// Colour.
	const fgRgb = parseColor(fg);
	const bgRgb = parseColor(bg);
	if (fgRgb && bgRgb) {
		const ratio = contrastRatio(fg, bg);
		if (ratio < CONTRAST_MIN) {
			out.push({
				level: 'warn',
				code: 'contrast',
				message: `Contrast between ${fg} and ${bg} is ${ratio.toFixed(1)}:1, below the ${CONTRAST_MIN}:1 minimum. Darken the modules or lighten the background.`
			});
		}
		if (isInverted(fg, bg)) {
			out.push({
				level: 'warn',
				code: 'inverted',
				message:
					'This code is light on dark. Recent iPhones and Google Lens cope, but older Android phones and dedicated scanners often fail. Dark modules on a light background is the safe choice.'
			});
		}
	}
	if (isReddish(fg)) {
		out.push({
			level: 'warn',
			code: 'red-foreground',
			message: `A red foreground (${fg}) can fail even when the contrast measures fine: scanners read with red light, so red modules reflect nearly as much as white paper. Use black or a dark blue or green.`
		});
	}

	// Logo.
	if (logoCover !== undefined) {
		const pct = Math.round(logoCover * 100);
		if (logoCover > LOGO_BLOCK_COVER) {
			out.push({
				level: 'block',
				code: 'logo-size',
				message: `The logo hides ${pct}% of this code, past the ${Math.round(LOGO_BLOCK_COVER * 100)}% ceiling. Error correction H rebuilds about 30% in theory, and print leaves nothing spare. Shrink the logo.`
			});
		} else if (logoCover > LOGO_WARN_COVER) {
			out.push({
				level: 'warn',
				code: 'logo-size',
				message: `The logo hides ${pct}% of this code, so error correction is doing most of the work. Above ${Math.round(LOGO_WARN_COVER * 100)}% a smudge or a bad angle breaks the scan. Shrink the logo, or shorten the content so the code has more modules to spare.`
			});
		}
	}
	if (hasLogo && ecc !== 'H') {
		out.push({
			level: 'warn',
			code: 'logo-ecc',
			message: `A logo covers part of this code but error correction is ${ecc}. Switch to H, which recovers about 30% of the symbol, before printing.`
		});
	}

	return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/* ------------------------------------------------------------------ status */

/** Badge status for the sizing panel. */
export type SizingStatus = 'print-safe' | 'scannable' | 'risky' | 'blocked';

/** Reduce a set of warnings plus the two key measurements to a single badge status. */
export function statusFor(warnings: Warning[], module: number, contrast: number): SizingStatus {
	if (warnings.some((w) => w.level === 'block')) return 'blocked';
	if (warnings.some((w) => w.level === 'warn')) return 'risky';
	if (module >= MODULE_MM_GOOD && contrast >= CONTRAST_MIN) return 'print-safe';
	if (module >= MODULE_MM_WARN) return 'scannable';
	return 'risky';
}

/** The one-line badge status for an input. */
export function summary(input: SizingInput): SizingStatus {
	const warnings = assess(input);
	const mm = moduleMm(input.widthMm, input.size, input.quiet ?? 4);
	const fg = input.fg ?? '#000000';
	const bg = paperColor(input.bg);
	// An unparseable colour (for example a transparent background) is not evidence of a
	// contrast problem, so treat it as exactly at the minimum.
	const contrast = parseColor(fg) && parseColor(bg) ? contrastRatio(fg, bg) : CONTRAST_MIN;
	return statusFor(warnings, mm, contrast);
}
