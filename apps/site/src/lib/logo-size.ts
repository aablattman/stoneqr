/**
 * How big a centre logo actually comes out.
 *
 * `@liquid-js/qr-code-styling` does not take a logo size. Its `imageOptions.imageSize` is a
 * coefficient of the error-correction budget: the library multiplies it by the recovery fraction
 * of the chosen level, turns that into a number of modules it is willing to hide, then cuts the
 * largest odd-sided rectangle of that area which matches the picture's aspect. The logo is
 * whatever is left inside once the margin is taken off. So the same coefficient produces a
 * different logo on every code, several coefficients produce the same logo, and past a point
 * raising it changes nothing at all.
 *
 * That is no use as a control, so the site asks for a width and works out the coefficient. This
 * module is a port of the library's `calculateImageSize` plus the budget arithmetic around it,
 * so we can predict the hole without rendering, and search for the coefficient that lands
 * nearest the width the user asked for.
 *
 * Everything here is pure arithmetic in module units, so it runs on every keystroke and is
 * tested in Node. The numbers in `apps/site/test/logo-size.test.ts` were read out of the
 * library's own SVG output: if a library update changes the formula, those tests fail rather
 * than every saved design quietly resizing.
 */
import type { Ecc } from '@stoneqr/engine';

/** The library's `errorCorrectionPercent`: the share of the symbol each level can rebuild. */
const ECC_PERCENT: Record<Ecc, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };

/** The library's own default `dotsOptions.size`, which `styled.ts` does not override. */
export const DOT_PX = 10;

/**
 * The logo width the site offers, as a fraction of the code's width. The default is chosen so a
 * short URL — the densest case, a version 3 code with only a few reachable sizes — still lands
 * comfortably inside the error-correction budget rather than opening on a warning. The top of
 * the range can warn or block on such a code, which is the honest answer.
 */
export const LOGO_WIDTH_MIN = 0.1;
export const LOGO_WIDTH_MAX = 0.32;
export const LOGO_WIDTH_DEFAULT = 0.2;

/**
 * How many alignment-pattern centres a version has per axis. Version 1 has none; from 2 on it is
 * `floor(version / 7) + 2`, which reproduces the standard's table (2 for v2 to v6, 3 for v7 to
 * v13, and so on up to 7 for v35 to v40).
 */
export function alignmentCount(version: number): number {
	return version <= 1 ? 0 : Math.floor(version / 7) + 2;
}

/**
 * The modules the library treats as available to hide under: the whole symbol less the three
 * finders with their separators and format information (192), the two timing lines (2 per module
 * of side beyond 16), and every alignment pattern (25 modules each).
 *
 * It is the library's own accounting, not a true count of data modules — the alignment term
 * double-counts the three that sit inside the finders — but it is the budget the hole is
 * rationed against, so the cover figures we report are measured against the same yardstick.
 */
export function budgetModules(modules: number, version: number): number {
	const a = alignmentCount(version);
	return modules * modules - 192 - 2 * (modules - 16) - a * a * 25;
}

export interface HoleInput {
	/** The library's `imageOptions.imageSize`, 0 to 1. */
	coefficient: number;
	/** Modules per side, excluding the quiet zone. */
	modules: number;
	version: number;
	ecc: Ecc;
	/** Clear margin around the logo, in modules. */
	margin: number;
	/** The picture's height divided by its width. */
	aspect: number;
}

export interface Hole {
	/** Modules removed across and down. The logo sits inside, inset by the margin. */
	hideX: number;
	hideY: number;
	/** The logo itself, in modules. Fractional: the picture keeps its aspect inside the hole. */
	logoW: number;
	logoH: number;
}

const EMPTY: Hole = { hideX: 0, hideY: 0, logoW: 0, logoH: 0 };

/** Round up to the next odd number, so the hole stays centred on the middle module. */
function odd(v: number): number {
	const n = Math.max(1, Math.ceil(v));
	return n % 2 === 0 ? n + 1 : n;
}

/**
 * Predict what the library will do with a coefficient. A faithful port of its
 * `calculateImageSize`, including the binary search, the odd-number rounding, and the pixel
 * rounding of the drawn size, which is why `DOT_PX` appears at all.
 */
export function predictHole(input: HoleInput): Hole {
	const { coefficient, modules, version, ecc, aspect } = input;
	const margin = Math.max(0, Math.round(input.margin));
	if (!(coefficient > 0) || !(aspect > 0) || !Number.isFinite(aspect) || modules <= 0) return EMPTY;

	const maxHidden = Math.floor(coefficient * ECC_PERCENT[ecc] * budgetModules(modules, version));
	// The hole may never reach the finders: 7 modules of finder plus a separator at each end.
	let axis = modules - 14;
	if (axis && axis % 2 === 0) axis = Math.max(1, axis - 1);
	if (maxHidden <= 0 || 4 * margin ** 2 > maxHidden) return EMPTY;

	// The picture is described by its longer and shorter side, so the search is aspect-agnostic.
	const maxDim = Math.max(1, aspect);
	const minDim = Math.min(1, aspect);

	let low = 0;
	let high = (axis || maxHidden) - 2 * margin;
	do {
		const mid = low + (high - low) / 2;
		if (odd(mid + 2 * margin) * odd((mid * minDim) / maxDim + 2 * margin) > maxHidden) high = mid;
		else low = mid;
	} while (Math.abs(low - high) > 0.001);

	const big = odd(low + 2 * margin);
	const small = odd((low * minDim) / maxDim + 2 * margin);
	// `aspect` is height over width, so a wide picture (aspect < 1) puts the long side across.
	const wide = aspect < 1;
	const hideX = wide ? big : small;
	const hideY = wide ? small : big;

	// The drawn picture fills the hole inside the margin, whichever axis binds first.
	let w = hideX - 2 * margin;
	let h = w * aspect;
	const maxH = hideY - 2 * margin;
	if (h > maxH) {
		h = maxH;
		w = h / aspect;
	}
	// The library rounds the boxed size to whole pixels, then takes the margin back off.
	const inset = 2 * margin * DOT_PX;
	return {
		hideX,
		hideY,
		logoW: (Math.round(w * DOT_PX + inset) - inset) / DOT_PX,
		logoH: (Math.round(h * DOT_PX + inset) - inset) / DOT_PX
	};
}

/** A predicted hole with the coefficient that produces it. */
export interface LogoFit extends Hole {
	coefficient: number;
	/** The logo's width as a fraction of the code's width, quiet zone excluded. */
	width: number;
	/** Hidden modules as a fraction of the budget: what the error correction is asked to rebuild. */
	cover: number;
	/** The hole's area as a fraction of the whole symbol. */
	area: number;
}

/** Nothing to place: no logo, or a code too small to take one. */
export const NO_LOGO: LogoFit = { ...EMPTY, coefficient: 0, width: 0, cover: 0, area: 0 };

/**
 * Find the coefficient whose logo lands nearest `targetWidth` (a fraction of the code's width).
 *
 * The reachable widths are a staircase, because a hole is a whole odd number of modules: on a
 * 29-module code a logo can be 3, 5, 7 or 9 modules wide and nothing in between. We pick the
 * nearest tread rather than the nearest below it, so the slider always moves somewhere, and the
 * readout reports what was actually reached instead of what was asked for.
 */
export function fitLogo(targetWidth: number, input: Omit<HoleInput, 'coefficient'>): LogoFit {
	const { modules, version } = input;
	if (!(targetWidth > 0) || modules <= 0) return NO_LOGO;
	const target = targetWidth * modules;

	let best: LogoFit | null = null;
	for (let i = 1; i <= 100; i++) {
		const coefficient = i / 100;
		const hole = predictHole({ ...input, coefficient });
		if (hole.logoW <= 0) continue;
		// Equal distance keeps the first (smaller) fit; ties go to the safer logo.
		if (best && Math.abs(hole.logoW - target) >= Math.abs(best.logoW - target)) continue;
		best = {
			...hole,
			coefficient,
			width: hole.logoW / modules,
			cover: (hole.hideX * hole.hideY) / budgetModules(modules, version),
			area: (hole.hideX * hole.hideY) / (modules * modules)
		};
	}
	return best ?? NO_LOGO;
}
