/**
 * Taking an SVG logo safely.
 *
 * `@liquid-js/qr-code-styling` already knows what to do with an SVG data URL: it parses the
 * markup and appends the `<svg>` element itself instead of an `<image>`, so the logo stays vector
 * all the way into our SVG download. What it does not do is check what is in the file, and an
 * uploaded SVG is a document, not a picture. It can carry script, fetch things off the network
 * when the exported file is opened, restyle the page it is dropped into, and collide with the
 * ids the renderer needs. So the file is rebuilt here before it is shown to anything.
 *
 * What comes out is a self-contained, inert, correctly sized drawing:
 *
 * - **Inert.** Script, embedded HTML, animation, links, event handlers, and every reference that
 *   points off the machine are gone. The exported file is the one that matters: a browser opening
 *   an SVG directly runs its script, and a print shop opens what we hand them.
 * - **Self-contained.** `<style>` rules are inlined onto the elements they match and the block is
 *   dropped, because SVG style rules are not scoped: pasted into the preview, `.hidden {}` in a
 *   logo would restyle the site around it. Class attributes go with them for the same reason.
 * - **Sized.** A viewBox is guaranteed, from the file's own, from its width and height, or
 *   measured. Without one a browser calls an SVG 300 by 150, which is how a square mark ends up
 *   in a hole cut for a 2:1 picture with the drawing spilling over the modules.
 * - **Scoped.** Every id and every internal reference is prefixed, so a logo carrying
 *   `mask-dot-color` or Figma's `clip0` cannot shadow the renderer's own.
 *
 * The pure string helpers are tested in `apps/site/test/logo-svg.test.ts`. The DOM half needs a
 * browser, so it is checked by `bun run logo-fixtures` against the files in
 * `apps/site/test/fixtures/logos/`.
 */

/** Prefix for every id we keep. Anything prefixed starts with this, which `CLIP_ID` never does. */
const PREFIX = 'lg-';
/** The clip that holds the drawing inside its own viewBox (the renderer sets overflow visible). */
const CLIP_ID = 'lgclip';
/** The clip a cropped logo's wrapper uses; like `CLIP_ID`, it cannot be a prefixed id. */
const CROP_CLIP_ID = 'lgcrop';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Elements that can run code, load a document, or move on their own. */
const DROP_TAGS = new Set([
	'script',
	'foreignobject',
	'animate',
	'animatemotion',
	'animatetransform',
	'set',
	'handler',
	'listener',
	'audio',
	'video',
	'iframe',
	'embed',
	'object',
	'metadata'
]);

/** Attributes that take a URL and so can reach off the machine. */
const URL_ATTRS = ['href', 'src', 'xlink:href', 'from', 'to', 'values', 'begin', 'end'];

export interface PreparedLogo {
	/** `data:image/svg+xml;base64,…`; the renderer only inlines the base64 form. */
	dataUrl: string;
	/** The drawing's own units, from the viewBox. */
	width: number;
	height: number;
	/** Plain-language things the person should know about their file. */
	notes: string[];
}

export class SvgLogoError extends Error {}

/* ------------------------------------------------------------------ pure string helpers */

const PX_PER_UNIT: Record<string, number> = {
	'': 1,
	px: 1,
	pt: 96 / 72,
	pc: 16,
	mm: 96 / 25.4,
	cm: 96 / 2.54,
	q: 96 / 25.4 / 4,
	in: 96
};

/**
 * A CSS length in px. Percentages and anything relative to a font or a viewport cannot be
 * resolved without a context, so they read as no length at all.
 */
export function lengthToPx(value: string | null | undefined): number | null {
	if (!value) return null;
	const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(value);
	if (!m) return null;
	const n = Number(m[1]);
	const unit = (m[2] ?? '').toLowerCase();
	const per = PX_PER_UNIT[unit];
	if (per === undefined || !Number.isFinite(n) || n <= 0) return null;
	return n * per;
}

/**
 * A viewBox built from a root's width and height. Without a viewBox those attributes set the
 * viewport and user units run 1:1 with px, so the box is the size in px, not the raw numbers:
 * a 10 mm wide drawing has a 37.8 unit viewBox.
 */
export function viewBoxFrom(width: string | null, height: string | null): string | null {
	const w = lengthToPx(width);
	const h = lengthToPx(height);
	if (w === null || h === null) return null;
	return `0 0 ${round(w)} ${round(h)}`;
}

/** The four numbers of a viewBox, or null if it is missing or malformed. */
export function parseViewBox(value: string | null | undefined): [number, number, number, number] | null {
	if (!value) return null;
	const parts = value.trim().split(/[\s,]+/).map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
	if (!(parts[2]! > 0) || !(parts[3]! > 0)) return null;
	return parts as [number, number, number, number];
}

/**
 * Whether a URL may stay. Only a reference inside this same file, or data already in it: anything
 * else would be fetched when the exported logo is opened, which turns a printed code into a
 * tracker and leaks whoever opened it.
 */
export function isLocalRef(value: string | null | undefined): boolean {
	if (!value) return false;
	const v = value.trim();
	if (v.startsWith('#')) return true;
	return /^data:image\/(png|jpeg|jpg|gif|webp);/i.test(v);
}

/**
 * Strip `url(…)` from a CSS declaration list unless it points inside the file. Used on `style`
 * attributes and on rules lifted out of a `<style>` block.
 */
export function sanitiseCssUrls(css: string): string {
	return css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (whole, _q, target: string) =>
		isLocalRef(target) ? whole : 'none'
	);
}

/** Rewrite `url(#foo)` to `url(#lg-foo)`, leaving anything else alone. */
export function prefixCssRefs(css: string): string {
	return css.replace(/url\(\s*(['"]?)#([^'")]+)\1\s*\)/gi, (_m, _q, id: string) => `url(#${PREFIX}${id})`);
}

/** True for a data URL the renderer will inline as live markup rather than draw as a picture. */
export function isSvgDataUrl(value: string | null | undefined): boolean {
	return typeof value === 'string' && /^data:image\/svg\+xml[;,]/i.test(value);
}

/**
 * The markup back out of a data URL, base64 or percent-encoded. Used when an SVG logo arrives
 * from somewhere other than the upload tile and has to be rebuilt before it is trusted.
 */
export function decodeSvgDataUrl(value: string): string {
	const comma = value.indexOf(',');
	if (comma < 0) throw new SvgLogoError('That logo could not be read.');
	const meta = value.slice(0, comma);
	const body = value.slice(comma + 1);
	if (/;base64/i.test(meta)) {
		const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	}
	return decodeURIComponent(body);
}

/** UTF-8 safe base64; a logo may carry any language in a title or a font name. */
export function toDataUrl(svgText: string): string {
	const bytes = new TextEncoder().encode(svgText);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function round(v: number): number {
	return Number(v.toFixed(3));
}

/**
 * A prepared logo cut down to a crop, still as a drawing. The original root is nested whole in a
 * wrapper whose viewBox is the crop, in the inner drawing's own units, and clipped to it: the
 * renderer sets `overflow="visible"` on whatever root it inlines, so a viewBox alone would let
 * the rest of the logo spill over the modules. The wrapper carries a width and height equal to
 * the crop so `new Image()` reports the crop's shape, which is what the hole is cut for.
 *
 * `crop` is fractions of the picture (left, top, width, height). The inner root's width and
 * height are rewritten to its viewBox, so the nested viewport is the whole drawing at 1:1 and
 * the crop is a plain scaling of the viewBox. A root with no usable size is returned untouched;
 * nothing prepared here lacks one, and the icons carry theirs.
 */
export function cropSvgMarkup(markup: string, crop: { u: number; v: number; w: number; h: number }): string {
	const open = /<svg\b[^>]*>/i.exec(markup);
	if (!open) return markup;
	const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(open[0])?.[1] ?? null;
	const box = parseViewBox(attr('viewBox')) ?? parseViewBox(viewBoxFrom(attr('width'), attr('height')));
	if (!box) return markup;
	const [, , vw, vh] = box;
	const x = round(crop.u * vw);
	const y = round(crop.v * vh);
	const w = round(crop.w * vw);
	const h = round(crop.h * vh);
	if (!(w > 0) || !(h > 0)) return markup;
	const inner =
		open[0]
			.replace(/\s(?:width|height|x|y)\s*=\s*"[^"]*"/gi, '')
			.replace(/^<svg\b/i, `<svg width="${round(vw)}" height="${round(vh)}"`) +
		markup.slice(open.index + open[0].length);
	return (
		`<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">` +
		`<clipPath id="${CROP_CLIP_ID}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>` +
		`<g clip-path="url(#${CROP_CLIP_ID})">${inner}</g></svg>`
	);
}

/** `cropSvgMarkup` for a data URL, base64 in and base64 out, which is the only form the renderer inlines. */
export function cropSvgDataUrl(dataUrl: string, crop: { u: number; v: number; w: number; h: number }): string {
	return toDataUrl(cropSvgMarkup(decodeSvgDataUrl(dataUrl), crop));
}

/* ------------------------------------------------------------------ the DOM half */

/**
 * Rebuild an uploaded SVG as something safe to draw, export, and hand to a print shop.
 * Browser only: it needs a parser, the selector engine, and sometimes layout to measure.
 *
 * @throws SvgLogoError with a sentence fit to show the person.
 */
export function prepareSvgLogo(text: string): PreparedLogo {
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	if (doc.getElementsByTagName('parsererror').length) {
		throw new SvgLogoError('That SVG could not be read. Re-export it from your drawing program.');
	}
	const root = doc.documentElement;
	if (!root || root.localName.toLowerCase() !== 'svg') {
		throw new SvgLogoError('That file is not an SVG drawing.');
	}

	const notes: string[] = [];
	sanitise(root, notes);
	inlineStyles(root, notes);

	const box = sizeOf(root);
	root.setAttribute('viewBox', `${round(box[0])} ${round(box[1])} ${round(box[2])} ${round(box[3])}`);
	// A definite intrinsic size, so every browser and the renderer agree on the shape. The
	// renderer overwrites both when it places the logo, so this only settles the measurement.
	root.setAttribute('width', String(round(box[2])));
	root.setAttribute('height', String(round(box[3])));
	root.removeAttribute('preserveAspectRatio');

	prefixIds(root);
	clipToViewBox(root, doc, box);

	if (!root.childElementCount) {
		throw new SvgLogoError('There was nothing left to draw in that SVG once it was cleaned up.');
	}

	root.setAttribute('xmlns', SVG_NS);
	const out = new XMLSerializer().serializeToString(root);
	return { dataUrl: toDataUrl(out), width: box[2], height: box[3], notes };
}

/** Remove everything that can act, and every reference that leaves the file. */
function sanitise(root: Element, notes: string[]): void {
	let removedActive = false;
	let removedRemote = false;

	// Comments and processing instructions carry nothing we need and can hide markup.
	const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_PROCESSING_INSTRUCTION);
	const junk: Node[] = [];
	while (walker.nextNode()) junk.push(walker.currentNode);
	for (const n of junk) n.parentNode?.removeChild(n);

	for (const el of [...root.querySelectorAll('*')]) {
		if (!el.isConnected) continue;
		const tag = el.localName.toLowerCase();

		if (DROP_TAGS.has(tag)) {
			el.remove();
			if (tag !== 'metadata') removedActive = true;
			continue;
		}
		// A link around artwork is meaningless once printed, but its target is not: unwrap it.
		if (tag === 'a') {
			while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
			el.remove();
			continue;
		}

		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			// Event handlers fire in the preview and in any browser that opens the export.
			if (name.startsWith('on')) {
				el.removeAttributeNode(attr);
				removedActive = true;
				continue;
			}
			if (URL_ATTRS.includes(name) && !isLocalRef(attr.value)) {
				el.removeAttributeNode(attr);
				removedRemote = true;
				continue;
			}
			if (name === 'style') {
				const cleaned = sanitiseCssUrls(attr.value);
				if (cleaned !== attr.value) removedRemote = true;
				el.setAttribute('style', cleaned);
				continue;
			}
			if (attr.value.includes('url(')) {
				const cleaned = sanitiseCssUrls(attr.value);
				if (cleaned !== attr.value) removedRemote = true;
				el.setAttribute(attr.name, cleaned);
			}
		}

		// A <use> or <image> whose target has just been taken away draws nothing.
		if ((tag === 'use' || tag === 'image') && !el.getAttribute('href') && !el.getAttributeNS(XLINK_NS, 'href')) {
			el.remove();
		}
	}

	for (const attr of [...root.attributes]) {
		const name = attr.name.toLowerCase();
		if (name.startsWith('on')) {
			root.removeAttributeNode(attr);
			removedActive = true;
		}
	}
	if (root.hasAttribute('style')) root.setAttribute('style', sanitiseCssUrls(root.getAttribute('style')!));

	if (removedActive) notes.push('Script and animation were removed from this SVG. The drawing itself is unchanged.');
	if (removedRemote) {
		notes.push('This SVG pointed at files on the internet. Those links were removed, so the logo prints the same anywhere.');
	}
	if (root.querySelector('text, tspan')) {
		notes.push('This SVG contains live text, which uses whatever font the reader has. Convert it to outlines for a reliable print.');
	}
}

/**
 * Move `<style>` rules onto the elements they match, then drop the block and every class.
 *
 * SVG style rules are document-wide, not scoped to the drawing, so a block left in place would
 * style the site around the preview. Matching is done with the browser's own selector engine on
 * the parsed document, so an Illustrator export (`.cls-1`) or a Figma one lands exactly as its
 * author intended. Rules are applied in document order and an existing `style` attribute wins,
 * which is the cascade for everything a logo actually uses.
 */
function inlineStyles(root: Element, notes: string[]): void {
	const blocks = [...root.querySelectorAll('style')];
	if (!blocks.length) {
		stripClasses(root);
		return;
	}
	let unsupported = false;

	for (const block of blocks) {
		const css = block.textContent ?? '';
		block.remove();
		if (/@import/i.test(css)) unsupported = true;
		let rules: CSSRuleList | null = null;
		try {
			const sheet = new CSSStyleSheet();
			sheet.replaceSync(sanitiseCssUrls(css));
			rules = sheet.cssRules;
		} catch {
			unsupported = true;
			continue;
		}
		for (const rule of [...rules]) {
			if (!(rule instanceof CSSStyleRule)) {
				// @media, @font-face and friends cannot be inlined onto an element.
				if (rule.cssText.trim()) unsupported = true;
				continue;
			}
			let targets: Element[];
			try {
				targets = [...root.querySelectorAll(rule.selectorText)];
			} catch {
				unsupported = true;
				continue;
			}
			// The root itself can be the target of a selector like `svg`.
			if (matches(root, rule.selectorText)) targets.unshift(root);
			for (const el of targets) {
				// The element's own style attribute is more specific, so it goes last and wins.
				const merged = [rule.style.cssText, el.getAttribute('style')]
					.map((d) => (d ?? '').trim().replace(/;+$/, ''))
					.filter(Boolean)
					.join(';');
				if (merged) el.setAttribute('style', merged);
			}
		}
	}
	stripClasses(root);
	if (unsupported) {
		notes.push('Some style rules in this SVG could not be carried over. Check the preview and flatten the file if it looks wrong.');
	}
}

function matches(el: Element, selector: string): boolean {
	try {
		return el.matches(selector);
	} catch {
		return false;
	}
}

function stripClasses(root: Element): void {
	root.removeAttribute('class');
	for (const el of root.querySelectorAll('[class]')) el.removeAttribute('class');
}

/**
 * The drawing's coordinate box: its own viewBox, else its width and height, else measured from
 * the geometry with the browser's help.
 */
function sizeOf(root: Element): [number, number, number, number] {
	const own = parseViewBox(root.getAttribute('viewBox'));
	if (own) return own;

	const fromSize = parseViewBox(viewBoxFrom(root.getAttribute('width'), root.getAttribute('height')));
	if (fromSize) return fromSize;

	const measured = measure(root);
	if (measured) return measured;

	throw new SvgLogoError(
		'This SVG does not say how big it is. Re-export it with a viewBox, or set a width and height on it.'
	);
}

/**
 * Lay the drawing out offscreen and ask the browser for its extent. Safe by this point: the
 * markup has already had everything that can act taken out of it.
 */
function measure(root: Element): [number, number, number, number] | null {
	if (typeof document === 'undefined') return null;
	const stage = document.createElementNS(SVG_NS, 'svg');
	stage.setAttribute('width', '1');
	stage.setAttribute('height', '1');
	stage.setAttribute('style', 'position:absolute;left:-99999px;top:0;overflow:hidden');
	stage.setAttribute('aria-hidden', 'true');
	const copy = root.cloneNode(true) as Element;
	// A nested svg establishes its own viewport, which would clip what we are trying to measure.
	const group = document.createElementNS(SVG_NS, 'g');
	while (copy.firstChild) group.appendChild(copy.firstChild);
	stage.appendChild(group);
	document.body.appendChild(stage);
	try {
		const box = (group as SVGGraphicsElement).getBBox();
		if (!(box.width > 0) || !(box.height > 0)) return null;
		return [box.x, box.y, box.width, box.height];
	} catch {
		return null;
	} finally {
		stage.remove();
	}
}

/** Prefix every id and every reference to one, so nothing shadows the renderer's own ids. */
function prefixIds(root: Element): void {
	const all = [root, ...root.querySelectorAll('*')];
	for (const el of all) {
		const id = el.getAttribute('id');
		if (id) el.setAttribute('id', PREFIX + id);
		for (const attr of [...el.attributes]) {
			const name = attr.name.toLowerCase();
			if ((name === 'href' || name === 'xlink:href') && attr.value.startsWith('#')) {
				el.setAttribute(attr.name, `#${PREFIX}${attr.value.slice(1)}`);
				continue;
			}
			if (attr.value.includes('url(')) el.setAttribute(attr.name, prefixCssRefs(attr.value));
		}
	}
}

/**
 * Hold the drawing inside its own box. The renderer sets `overflow="visible"` on the logo it
 * places, so a file whose art runs past its viewBox would otherwise spill across the modules.
 */
function clipToViewBox(root: Element, doc: Document, box: [number, number, number, number]): void {
	const clip = doc.createElementNS(SVG_NS, 'clipPath');
	clip.setAttribute('id', CLIP_ID);
	clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
	const rect = doc.createElementNS(SVG_NS, 'rect');
	rect.setAttribute('x', String(round(box[0])));
	rect.setAttribute('y', String(round(box[1])));
	rect.setAttribute('width', String(round(box[2])));
	rect.setAttribute('height', String(round(box[3])));
	clip.appendChild(rect);

	const group = doc.createElementNS(SVG_NS, 'g');
	group.setAttribute('clip-path', `url(#${CLIP_ID})`);
	while (root.firstChild) group.appendChild(root.firstChild);
	root.appendChild(clip);
	root.appendChild(group);
}
