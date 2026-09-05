/**
 * Browser side of `bun run scan-sheets`: render every code the scan matrix asks for, decode-check
 * each one in software, lay them out on Letter pages with their row IDs, add a score sheet, and
 * POST the PDF back to generate.mjs.
 *
 * The renderers are the site's own (styled.ts, halftone.ts, glyphs.ts) and the engine's, so what
 * lands on paper is what the generator would produce for the same settings. Imports go through
 * apps/site/node_modules so Bun resolves the same copies the site uses.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from '../../apps/site/node_modules/pdf-lib';
import {
	encode,
	payloads,
	rasterize,
	verifyRaster,
	verifyImageData,
	halftoneWithFallback,
	halftoneVersionFor,
	renderHalftone,
	moduleMm,
	contrastRatio,
	maxScanDistanceM,
	type EncodedQr,
	type Ecc,
	type HalftoneOptions,
	type RasterImage
} from '../../apps/site/node_modules/@stoneqr/engine';
import { renderStyled, type StyleOptions } from '../../apps/site/src/lib/styled';
import { svgToCanvas, canvasToPngBlob, canvasImageData } from '../../apps/site/src/lib/svg-raster';
import { loadImageRaster, rasterToPngBlob } from '../../apps/site/src/lib/halftone';
import { GLYPHS, glyphDataUrl } from '../../apps/site/src/lib/glyphs';
import { LOOKS, type LookId } from '../../apps/site/src/lib/looks';
import { SIZE_TIERS } from '../../apps/site/src/lib/generator/sizes';

// ---------------------------------------------------------------------------------------------
// What goes on the sheets. IDs match the tables in docs/scan-matrix.md; keep the two in step.
// ---------------------------------------------------------------------------------------------

const SITE = 'https://stoneqr.app';
const STYLED_DPI = 600;
const HALFTONE_DPI = 400;
const QUIET = 4;

// `?s=` keeps the URL under 26 bytes so it stays a version 2 symbol at ECC M, as the matrix says.
const scanUrl = (id: string) => `${SITE}/?s=${id}`;

interface PlainSpec {
	kind: 'plain';
	payload: string;
	ecc: Ecc;
	minVersion?: number;
	quiet?: number;
	fg?: string;
	bg?: string;
}
interface StyledSpec {
	kind: 'styled';
	payload: string;
	ecc: Ecc;
	look: LookId;
	fg?: string;
	bg?: string;
	gradientTo?: string;
	logo?: 'favicon';
	logoArea?: number; // fraction of the code's area
	logoKnockout?: boolean;
	frame?: string;
}
interface HalftoneSpec {
	kind: 'halftone';
	payload: string;
	picture: 'photo' | 'favicon' | { glyph: string };
	opts: HalftoneOptions;
}
type Spec = PlainSpec | StyledSpec | HalftoneSpec;

interface Item {
	id: string;
	mm: number;
	what: string;
	spec: Spec;
	/** Tile onto several pages instead of placing on the flow. */
	tile?: boolean;
}
interface Section {
	code: string;
	title: string;
	watch: string;
	items: Item[];
}

const plain = (id: string, mm: number, what: string, extra: Partial<PlainSpec> = {}): Item => ({
	id,
	mm,
	what,
	spec: { kind: 'plain', payload: scanUrl(id), ecc: 'M', minVersion: 2, ...extra }
});
const styled = (id: string, mm: number, what: string, look: LookId, extra: Partial<StyledSpec> = {}): Item => ({
	id,
	mm,
	what,
	spec: { kind: 'styled', payload: scanUrl(id), ecc: 'M', look, ...extra }
});
const halftone = (id: string, mm: number, what: string, picture: HalftoneSpec['picture'], opts: HalftoneOptions = {}): Item => ({
	id,
	mm,
	what,
	spec: { kind: 'halftone', payload: scanUrl(id), picture, opts: { dotScale: 0.4, ...opts } }
});

const TEST_PHONE = '+1 555 555 0100';
const eventStart = new Date(2026, 9, 1, 10, 0, 0);
const eventEnd = new Date(2026, 9, 1, 11, 0, 0);

const SECTIONS: Section[] = [
	{
		code: 'A',
		title: 'Plain black on white',
		watch: 'ECC M, version 2 URL. The baseline every other row is compared with.',
		items: [plain('A1', 15, 'Plain 15 mm'), plain('A2', 20, 'Plain 20 mm'), plain('A3', 30, 'Plain 30 mm'), plain('A4', 50, 'Plain 50 mm')]
	},
	{
		code: 'B',
		title: 'Styled: the Rounded preset',
		watch: 'Rounded modules with extra-rounded corners. Compare with row A at the same size.',
		items: [styled('B1', 20, 'Rounded 20 mm', 'rounded'), styled('B2', 30, 'Rounded 30 mm', 'rounded'), styled('B3', 50, 'Rounded 50 mm', 'rounded')]
	},
	{
		code: 'C',
		title: 'Logo at 20% of the area, ECC H, knockout on',
		watch: 'The site warns above 20% and blocks above 25%. This is the largest logo it allows without a warning.',
		items: [
			styled('C1', 30, 'Logo 20% · 30 mm', 'classic', { ecc: 'H', logo: 'favicon', logoArea: 0.2, logoKnockout: true }),
			styled('C2', 50, 'Logo 20% · 50 mm', 'classic', { ecc: 'H', logo: 'favicon', logoArea: 0.2, logoKnockout: true })
		]
	},
	{
		code: 'D',
		title: 'Inverted: white on black',
		watch: 'The plan expects older Android cameras to fail here. Note the phone and OS version if one does.',
		items: [plain('D1', 30, 'Inverted 30 mm', { fg: '#ffffff', bg: '#000000' })]
	},
	{
		code: 'E',
		title: 'Framed: call-to-action band',
		watch: 'The frame sits outside the quiet zone. Check the label is legible and the code still reads small.',
		items: [styled('E1', 20, 'Framed 20 mm', 'classic', { frame: 'Scan me' }), styled('E2', 30, 'Framed 30 mm', 'classic', { frame: 'Scan me' })]
	},
	{
		code: 'F',
		title: 'Photo QR, colour, dot size 0.4',
		watch: 'A photograph under the modules. If the fallback ladder had to enlarge the dots or fade the picture, the caption says so.',
		items: [halftone('F1', 30, 'Photo 30 mm', 'photo'), halftone('F2', 50, 'Photo 50 mm', 'photo')]
	},
	{
		code: 'G',
		title: 'Silhouette: built-in WiFi shape, cut 50%',
		watch: 'Light dots inside the solid ink arcs are the weak point; a small print turns them grey first.',
		items: [halftone('G1', 30, 'Silhouette WiFi 30 mm', { glyph: 'wifi' }, { threshold: 0.5 }), halftone('G2', 50, 'Silhouette WiFi 50 mm', { glyph: 'wifi' }, { threshold: 0.5 })]
	},
	{
		code: 'H',
		title: 'Silhouette from a logo with a coloured background',
		watch: 'The StoneQR mark, cut so the shape is solid. A real logo upload follows this path.',
		items: [halftone('H1', 50, 'Silhouette logo 50 mm', 'favicon', { threshold: 0.5 })]
	},
	{
		code: 'I',
		title: 'Photo QR zoomed 2× and shifted 25%',
		watch: 'A busy crop into the middle of the picture. Expect the fallback ladder more often than row F.',
		items: [
			halftone('I1', 30, 'Photo zoom 2× · 30 mm', 'photo', { imageZoom: 2, imageOffsetX: 0.25, imageOffsetY: 0.25 }),
			halftone('I2', 50, 'Photo zoom 2× · 50 mm', 'photo', { imageZoom: 2, imageOffsetX: 0.25, imageOffsetY: 0.25 })
		]
	},
	{
		code: 'J',
		title: 'Content types, 30 mm plain',
		watch: 'Here the question is what the phone offers, not whether it reads: "Join network", "Add contact", "Add to calendar".',
		items: [
			plain('J1', 30, 'WiFi WPA', { payload: payloads.wifi({ ssid: 'StoneQR Test', password: 'set-in-stone', auth: 'WPA' }), minVersion: 1 }),
			plain('J2', 30, 'vCard 3.0', {
				minVersion: 1,
				payload: payloads.vcard({ firstName: 'Ada', lastName: 'Stone', org: 'StoneQR', title: 'Scan tester', mobile: TEST_PHONE, email: 'hello@stoneqr.app', url: SITE })
			}),
			plain('J3', 30, 'MeCard', { minVersion: 1, payload: payloads.mecard({ firstName: 'Ada', lastName: 'Stone', mobile: TEST_PHONE, email: 'hello@stoneqr.app' }) }),
			plain('J4', 30, 'mailto with subject', { minVersion: 1, payload: payloads.mailto({ to: 'hello@stoneqr.app', subject: 'Scan test J4' }) }),
			plain('J5', 30, 'sms: with body', { minVersion: 1, payload: payloads.sms({ to: TEST_PHONE, body: 'Scan test J5', scheme: 'sms' }) }),
			plain('J6', 30, 'SMSTO:', { minVersion: 1, payload: payloads.sms({ to: TEST_PHONE, body: 'Scan test J6', scheme: 'smsto' }) }),
			plain('J7', 30, 'tel:', { minVersion: 1, payload: payloads.tel(TEST_PHONE) }),
			plain('J8', 30, 'geo:', { minVersion: 1, payload: payloads.geo({ lat: 51.5007, lng: -0.1246, query: 'Big Ben' }) }),
			plain('J9', 30, 'VEVENT', { minVersion: 1, payload: payloads.vevent({ summary: 'StoneQR scan test', start: eventStart, end: eventEnd, location: 'Kitchen table' }) })
		]
	},
	{
		code: 'K',
		title: 'Basic size tiers',
		watch: 'Scan each from the distance its card promises, in ordinary indoor light. K4 is tiled over four pages; trim and butt-join.',
		items: SIZE_TIERS.map((t, i) => ({
			...plain(`K${i + 1}`, t.mm, `${t.name} ${t.mm} mm · promised ${Math.round(maxScanDistanceM(t.mm) * 100)} cm`, { minVersion: 1 }),
			tile: t.mm > 150
		}))
	},
	{
		code: 'L',
		title: 'Stress: the risky things the site allows with a warning',
		watch: 'A failure here is useful data, not a bug. It tells us whether the warning copy is strong enough.',
		items: [
			plain('L1', 30, 'Grey ink at the contrast floor (4.3:1)', { fg: '#7a7a7a' }),
			plain('L2', 30, 'Red ink (red-light scanners)', { fg: '#a3301d' }),
			plain('L3', 10, 'Tiny: 10 mm, 0.30 mm modules'),
			plain('L4', 30, 'Dense: long vCard, ECC M', {
				minVersion: 1,
				payload: payloads.vcard({
					firstName: 'Ada',
					lastName: 'Stone',
					org: 'StoneQR Test Laboratories International',
					title: 'Principal scan tester and printer whisperer',
					mobile: TEST_PHONE,
					work: '+1 555 555 0199',
					email: 'ada.stone@example.com',
					url: `${SITE}/?s=L4`,
					street: '1 Long Street, Suite 400',
					city: 'Springfield',
					region: 'OR',
					postal: '97477',
					country: 'USA',
					note: 'Dense content at 30 mm: modules about 0.4 mm, the site calls this tight.'
				})
			}),
			styled('L5', 30, 'Dots preset, ECC L', 'dots', { ecc: 'L' }),
			styled('L6', 30, 'Logo at 25% area, knockout off', 'classic', { ecc: 'H', logo: 'favicon', logoArea: 0.25, logoKnockout: false }),
			halftone('L7', 30, 'Photo, smallest dots 0.25, no fade', 'photo', { dotScale: 0.25 }),
			styled('L8', 30, 'Gradient to a light teal', 'classic', { fg: '#1b1917', gradientTo: '#5aa896' }),
			plain('L9', 30, 'Quiet zone 1 module', { quiet: 1 }),
			styled('L10', 30, 'Inverted Dots preset', 'dots', { fg: '#ffffff', bg: '#000000' }),
			styled('L11', 30, 'Leaf preset (classy shapes)', 'leaf'),
			halftone('L12', 30, 'Silhouette Heart, cut 25% (thin shape)', { glyph: 'heart' }, { threshold: 0.25 })
		]
	}
];

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

interface Rendered {
	item: Item;
	/** Width of the artwork over the width of the code (frames add to it). */
	scale: number;
	/** Height over width of the artwork. */
	aspect: number;
	moduleMm: number;
	version: number;
	decoded: boolean;
	note: string;
	vector?: { qr: EncodedQr; quiet: number; fg: string; bg: string };
	png?: Uint8Array;
}

const status = document.getElementById('status')!;
const logEl = document.getElementById('log')!;
const log = (line: string, ok = true) => {
	const p = document.createElement('div');
	p.className = ok ? 'ok' : 'bad';
	p.textContent = line;
	logEl.append(p);
	void fetch('/log', { method: 'POST', body: line });
};

async function faviconPngDataUrl(): Promise<string> {
	const svg = await fetch('/favicon.svg').then((r) => r.text());
	const img = new Image();
	await new Promise<void>((res, rej) => {
		img.onload = () => res();
		img.onerror = () => rej(new Error('favicon failed to load'));
		img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace('<svg ', '<svg width="512" height="512" '))}`;
	});
	const c = document.createElement('canvas');
	c.width = c.height = 512;
	c.getContext('2d')!.drawImage(img, 0, 0, 512, 512);
	return c.toDataURL('image/png');
}

/** A real photo when the script was given one; otherwise a painted stand-in with the same kind of tonal range. */
async function photoDataUrl(): Promise<{ url: string; synthetic: boolean }> {
	const res = await fetch('/photo');
	if (res.ok) {
		const blob = await res.blob();
		const url = await new Promise<string>((r) => {
			const fr = new FileReader();
			fr.onload = () => r(fr.result as string);
			fr.readAsDataURL(blob);
		});
		return { url, synthetic: false };
	}
	const c = document.createElement('canvas');
	c.width = 900;
	c.height = 900;
	const ctx = c.getContext('2d')!;
	const sky = ctx.createLinearGradient(0, 0, 0, 540);
	sky.addColorStop(0, '#2b4c7e');
	sky.addColorStop(1, '#e7b58a');
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, 900, 900);
	ctx.fillStyle = '#f7d774';
	ctx.beginPath();
	ctx.arc(640, 300, 110, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#4a5a3c';
	ctx.beginPath();
	ctx.moveTo(0, 620);
	for (let x = 0; x <= 900; x += 30) ctx.lineTo(x, 560 + 60 * Math.sin(x / 90) + 25 * Math.sin(x / 37));
	ctx.lineTo(900, 900);
	ctx.lineTo(0, 900);
	ctx.fill();
	ctx.fillStyle = '#2f3a26';
	ctx.beginPath();
	ctx.moveTo(0, 760);
	for (let x = 0; x <= 900; x += 30) ctx.lineTo(x, 720 + 40 * Math.sin(x / 60 + 2));
	ctx.lineTo(900, 900);
	ctx.lineTo(0, 900);
	ctx.fill();
	// Fine texture so the picture is as busy as a real photograph.
	const img = ctx.getImageData(0, 0, 900, 900);
	let seed = 7;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
	for (let i = 0; i < img.data.length; i += 4) {
		const n = rnd() * 18;
		img.data[i] += n;
		img.data[i + 1] += n;
		img.data[i + 2] += n;
	}
	ctx.putImageData(img, 0, 0);
	return { url: c.toDataURL('image/jpeg', 0.9), synthetic: true };
}

/**
 * The software decoder reads dark-on-light only, like most phone cameras a few years ago. For an
 * inverted design the check runs on the negative, so the sheet still says whether the symbol is
 * sound; whether a phone reads it as printed is exactly what the D and L10 rows are for.
 */
const luminance = (hex: string) => hexToRgb(hex).reduce((a, c) => a + c, 0);
function negativeIfInverted<T extends { data: Uint8ClampedArray }>(img: T, fg: string, bg: string): T {
	if (luminance(fg) <= luminance(bg)) return img;
	const d = img.data;
	for (let i = 0; i < d.length; i += 4) {
		d[i] = 255 - d[i]!;
		d[i + 1] = 255 - d[i + 1]!;
		d[i + 2] = 255 - d[i + 2]!;
	}
	return img;
}

const hexToRgb = (hex: string): [number, number, number] => {
	const h = hex.replace('#', '');
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

async function renderItem(item: Item, pictures: { favicon: string; photo: string }): Promise<Rendered> {
	const spec = item.spec;
	if (spec.kind === 'plain') {
		const quiet = spec.quiet ?? QUIET;
		const qr = encode(spec.payload, { ecc: spec.ecc, minVersion: spec.minVersion ?? 1 });
		const fg = spec.fg ?? '#000000';
		const bg = spec.bg ?? '#ffffff';
		const check = verifyRaster(negativeIfInverted(rasterize(qr, { quietZone: quiet, fg: hexToRgb(fg), bg: hexToRgb(bg) }), fg, bg), spec.payload);
		const notes: string[] = [];
		const cr = contrastRatio(fg, bg);
		if (cr < 4.5) notes.push(`contrast ${cr.toFixed(1)}:1`);
		return {
			item,
			scale: 1,
			aspect: 1,
			moduleMm: moduleMm(item.mm, qr.size, quiet),
			version: qr.version,
			decoded: check.ok,
			note: notes.join(' · '),
			vector: { qr, quiet, fg, bg }
		};
	}
	if (spec.kind === 'styled') {
		const qr = encode(spec.payload, { ecc: spec.ecc, minVersion: 2 });
		const look = LOOKS.find((l) => l.id === spec.look)!;
		const opts: StyleOptions = {
			payload: spec.payload,
			ecc: spec.ecc,
			version: qr.version,
			quietZone: QUIET,
			fg: spec.fg ?? '#000000',
			bg: spec.bg ?? '#ffffff',
			dot: look.dot,
			cornerSquare: look.cornerSquare,
			cornerDot: look.cornerDot,
			gradient: spec.gradientTo ? 'linear' : 'none',
			gradientTo: spec.gradientTo ?? spec.fg ?? '#000000',
			gradientAngleDeg: 45,
			logo: spec.logo ? pictures.favicon : undefined,
			logoSize: spec.logoArea ? Math.sqrt(spec.logoArea) : 0,
			logoKnockout: spec.logoKnockout ?? true,
			logoMargin: 1,
			frame: { enabled: !!spec.frame, text: spec.frame ?? '', color: '#000000', textColor: '#ffffff' }
		};
		const result = await renderStyled(opts, item.mm);
		const total = result.size + 2 * QUIET;
		const checkCanvas = await svgToCanvas(result.svg, total * 10 * result.scale, opts.bg);
		const check = verifyImageData(negativeIfInverted(canvasImageData(checkCanvas), opts.fg, opts.bg), spec.payload);
		const printCanvas = await svgToCanvas(result.svg, Math.round(((item.mm * result.scale) / 25.4) * STYLED_DPI), opts.bg);
		const png = new Uint8Array(await (await canvasToPngBlob(printCanvas)).arrayBuffer());
		return {
			item,
			scale: result.scale,
			aspect: printCanvas.height / printCanvas.width,
			moduleMm: moduleMm(item.mm, result.size, QUIET),
			version: qr.version,
			decoded: check.ok,
			note: '',
			png
		};
	}
	// Photo QR
	const qr = encode(spec.payload, { ecc: 'H', minVersion: halftoneVersionFor(spec.payload) });
	const src =
		spec.picture === 'photo' ? pictures.photo : spec.picture === 'favicon' ? pictures.favicon : glyphDataUrl(GLYPHS.find((g) => g.id === spec.picture.glyph)!);
	const source: RasterImage = await loadImageRaster(src, 1024);
	const result = halftoneWithFallback(qr, source, spec.payload, spec.opts);
	const total = qr.size + 2 * QUIET;
	const ppm = Math.max(4, Math.ceil((item.mm / 25.4) * HALFTONE_DPI / total));
	const raster = renderHalftone(qr, source, { ...result.opts, pxPerModule: ppm });
	const png = new Uint8Array(await (await rasterToPngBlob(raster)).arrayBuffer());
	return {
		item,
		scale: 1,
		aspect: 1,
		moduleMm: moduleMm(item.mm, qr.size, QUIET),
		version: qr.version,
		decoded: result.ok,
		note: result.note ? `fallback: ${result.note.replace(/ so the code decodes\.?/, '').replace(/\.$/, '')}` : '',
		png
	};
}

// ---------------------------------------------------------------------------------------------
// PDF layout
// ---------------------------------------------------------------------------------------------

const PT = 72 / 25.4;
const PAGE_W = 215.9;
const PAGE_H = 279.4;
const MARGIN = 14;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = MARGIN + 8;
const INK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.75, 0.75, 0.75);
const BAD = rgb(0.64, 0.19, 0.11);

class Sheet {
	pages: PDFPage[] = [];
	page!: PDFPage;
	/** Current y in mm from the top of the page. */
	y = MARGIN;
	constructor(
		public doc: PDFDocument,
		public font: PDFFont,
		public bold: PDFFont,
		public built: string
	) {}

	newPage(): void {
		this.page = this.doc.addPage([PAGE_W * PT, PAGE_H * PT]);
		this.pages.push(this.page);
		this.y = MARGIN;
		this.text(`StoneQR scan sheets · built ${this.built} · Letter, print at 100% (no "fit to page")`, MARGIN, this.y + 3, 7, this.font, GREY);
		this.y += 8;
	}

	/** Draw text with its top at y (mm from top). */
	text(s: string, x: number, yTop: number, size: number, font: PDFFont, color = INK): void {
		this.page.drawText(s, { x: x * PT, y: (PAGE_H - yTop) * PT - size, size, font, color });
	}

	wrap(s: string, size: number, font: PDFFont, widthMm: number): string[] {
		const words = s.split(' ');
		const lines: string[] = [];
		let line = '';
		for (const w of words) {
			const next = line ? `${line} ${w}` : w;
			if (font.widthOfTextAtSize(next, size) / PT > widthMm && line) {
				lines.push(line);
				line = w;
			} else line = next;
		}
		if (line) lines.push(line);
		return lines;
	}

	ensure(heightMm: number): void {
		if (this.y + heightMm > PAGE_H - BOTTOM) this.newPage();
	}

	heading(section: Section, firstRowMm = 20): void {
		const lines = this.wrap(section.watch, 8, this.font, CONTENT_W);
		this.ensure(14 + lines.length * 3.6 + firstRowMm + 6);
		this.y += 4;
		this.page.drawLine({ start: { x: MARGIN * PT, y: (PAGE_H - this.y) * PT }, end: { x: (PAGE_W - MARGIN) * PT, y: (PAGE_H - this.y) * PT }, thickness: 0.6, color: INK });
		this.y += 2;
		this.text(`${section.code}  ${section.title}`, MARGIN, this.y, 12, this.bold);
		this.y += 6;
		for (const l of lines) {
			this.text(l, MARGIN, this.y, 8, this.font, GREY);
			this.y += 3.6;
		}
		this.y += 3;
	}

	/** Lay a section's rendered codes out in rows, bottom-aligned so captions share a baseline. */
	async flow(items: Rendered[]): Promise<void> {
		const cells = items.map((r) => {
			const w = r.item.mm * r.scale;
			const h = w * r.aspect;
			const captionW = Math.max(w, 34);
			const caption = this.captionLines(r, captionW);
			return { r, w, h, width: captionW, caption, height: h + 2 + caption.length * 3.2 };
		});
		const gap = 8;
		let row: typeof cells = [];
		let rowW = 0;
		const rows: (typeof cells)[] = [];
		for (const c of cells) {
			if (row.length && rowW + gap + c.width > CONTENT_W) {
				rows.push(row);
				row = [];
				rowW = 0;
			}
			rowW += (row.length ? gap : 0) + c.width;
			row.push(c);
		}
		if (row.length) rows.push(row);
		for (const cellsInRow of rows) {
			const rowH = Math.max(...cellsInRow.map((c) => c.height));
			this.ensure(rowH + 4);
			let x = MARGIN;
			for (const c of cellsInRow) {
				const top = this.y + (rowH - c.height);
				await this.drawCode(c.r, x, top, c.w);
				let cy = top + c.h + 2;
				c.caption.forEach((line, i) => {
					const isId = i === 0;
					this.text(line.text, x, cy, isId ? 9 : 7, isId ? this.bold : this.font, line.bad ? BAD : isId ? INK : GREY);
					cy += 3.2;
				});
				x += c.width + gap;
			}
			this.y += rowH + 6;
		}
	}

	captionLines(r: Rendered, widthMm: number): { text: string; bad?: boolean }[] {
		const out: { text: string; bad?: boolean }[] = [{ text: `${r.item.id}  ${r.item.mm} mm` }];
		for (const l of this.wrap(r.item.what, 7, this.font, widthMm)) out.push({ text: l });
		out.push({ text: `v${r.version} · ${r.moduleMm.toFixed(2)} mm modules` });
		out.push(r.decoded ? { text: 'software decode: yes' } : { text: 'software decode: NO', bad: true });
		if (r.note) for (const l of this.wrap(r.note, 7, this.font, widthMm)) out.push({ text: l, bad: true });
		return out;
	}

	async drawCode(r: Rendered, x: number, top: number, w: number, clip?: { x: number; y: number; w: number; h: number }): Promise<void> {
		if (r.png) {
			const img = await this.doc.embedPng(r.png);
			const h = w * r.aspect;
			this.page.drawImage(img, { x: x * PT, y: (PAGE_H - top - h) * PT, width: w * PT, height: h * PT });
			return;
		}
		const { qr, quiet, fg, bg } = r.vector!;
		const total = qr.size + 2 * quiet;
		const m = w / total;
		const fill = (hex: string) => {
			const [rr, g, b] = hexToRgb(hex);
			return rgb(rr / 255, g / 255, b / 255);
		};
		const rect = (rx: number, ry: number, rw: number, rh: number, color: ReturnType<typeof rgb>) => {
			if (clip) {
				const x0 = Math.max(rx, clip.x);
				const y0 = Math.max(ry, clip.y);
				const x1 = Math.min(rx + rw, clip.x + clip.w);
				const y1 = Math.min(ry + rh, clip.y + clip.h);
				if (x1 <= x0 || y1 <= y0) return;
				rx = x0;
				ry = y0;
				rw = x1 - x0;
				rh = y1 - y0;
			}
			this.page.drawRectangle({ x: rx * PT, y: (PAGE_H - ry - rh) * PT, width: rw * PT, height: rh * PT, color, borderWidth: 0 });
		};
		if (bg !== '#ffffff') rect(x, top, w, w, fill(bg));
		const ink = fill(fg);
		for (let ry = 0; ry < qr.size; ry++) {
			const rowMods = qr.matrix[ry]!;
			let cx = 0;
			while (cx < qr.size) {
				if (!rowMods[cx]) {
					cx++;
					continue;
				}
				let run = cx;
				while (run < qr.size && rowMods[run]) run++;
				rect(x + (quiet + cx) * m, top + (quiet + ry) * m, (run - cx) * m, m, ink);
				cx = run;
			}
		}
	}

	/** A code wider than the page, split into four quadrants with a hairline to trim on. */
	async tiles(r: Rendered): Promise<void> {
		const w = r.item.mm;
		const half = w / 2;
		const places = ['top left', 'top right', 'bottom left', 'bottom right'];
		for (let i = 0; i < 4; i++) {
			this.newPage();
			const qx = i % 2;
			const qy = Math.floor(i / 2);
			this.text(`${r.item.id}  ${r.item.what}`, MARGIN, this.y, 12, this.bold);
			this.y += 6;
			for (const l of this.wrap(
				`Tile ${i + 1} of 4 (${places[i]}). Trim along the grey hairline on the inner edges and butt the four tiles together; the outer edges keep their quiet zone. ${r.moduleMm.toFixed(1)} mm modules, software decode: ${r.decoded ? 'yes' : 'NO'}.`,
				8,
				this.font,
				CONTENT_W
			)) {
				this.text(l, MARGIN, this.y, 8, this.font, GREY);
				this.y += 3.6;
			}
			this.y += 6;
			const ox = MARGIN + (CONTENT_W - half) / 2;
			const oy = this.y;
			const clip = { x: ox, y: oy, w: half, h: half };
			await this.drawCode(r, ox - qx * half, oy - qy * half, w, clip);
			this.page.drawRectangle({ x: ox * PT, y: (PAGE_H - oy - half) * PT, width: half * PT, height: half * PT, borderWidth: 0.3, borderColor: RULE });
			this.text(`${places[i]} · join on this side`, ox, oy + half + 2, 7, this.font, GREY);
		}
	}

	scoreSheet(items: Rendered[], phones: string[]): void {
		const cols = [14, 74, ...phones.map(() => 19), 0];
		cols[cols.length - 1] = CONTENT_W - cols.slice(0, -1).reduce((a, b) => a + b, 0);
		const headers = ['ID', 'Code', ...phones, 'Notes'];
		const rowH = 7.2;
		const header = () => {
			let x = MARGIN;
			headers.forEach((h, i) => {
				this.text(h, x + 1, this.y + 1.2, 8, this.bold);
				x += cols[i]!;
			});
			this.y += rowH - 1;
			this.page.drawLine({ start: { x: MARGIN * PT, y: (PAGE_H - this.y) * PT }, end: { x: (PAGE_W - MARGIN) * PT, y: (PAGE_H - this.y) * PT }, thickness: 0.5, color: INK });
		};
		this.newPage();
		this.text('Score sheet', MARGIN, this.y, 14, this.bold);
		this.y += 7;
		for (const l of this.wrap(
			`Legend: OK = scanned first try · ~ = scanned after moving or changing the light · X = did not scan. Write the phone model and OS version at the top of each column. Scan from about ten times the code width away (a 30 mm code from 30 cm), then move closer only if it fails. Copy the results into docs/scan-matrix.md.`,
			8,
			this.font,
			CONTENT_W
		)) {
			this.text(l, MARGIN, this.y, 8, this.font, GREY);
			this.y += 3.6;
		}
		this.y += 4;
		header();
		for (const r of items) {
			if (this.y + rowH > PAGE_H - BOTTOM) {
				this.newPage();
				header();
			}
			let x = MARGIN;
			const cells = [r.item.id, /\d mm/.test(r.item.what) ? r.item.what : `${r.item.what} · ${r.item.mm} mm`, ...phones.map(() => ''), ''];
			cells.forEach((c, i) => {
				if (c) this.text(c, x + 1, this.y + 1.6, 7.5, i === 0 ? this.bold : this.font);
				x += cols[i]!;
			});
			this.y += rowH;
			this.page.drawLine({ start: { x: MARGIN * PT, y: (PAGE_H - this.y) * PT }, end: { x: (PAGE_W - MARGIN) * PT, y: (PAGE_H - this.y) * PT }, thickness: 0.2, color: RULE });
		}
	}

	numberPages(): void {
		this.pages.forEach((p, i) => {
			const s = `${i + 1} / ${this.pages.length}`;
			p.drawText(s, { x: (PAGE_W - MARGIN) * PT - this.font.widthOfTextAtSize(s, 7), y: (PAGE_H - MARGIN) * PT - 4, size: 7, font: this.font, color: GREY });
		});
	}
}

// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
	const built = new Date().toISOString().slice(0, 10);
	const favicon = await faviconPngDataUrl();
	const photo = await photoDataUrl();
	log(photo.synthetic ? 'Photo: painted stand-in (pass --photo <file> for a real one)' : 'Photo: the file you passed');
	const pictures = { favicon, photo: photo.url };

	const rendered = new Map<string, Rendered[]>();
	const all: Rendered[] = [];
	let failures = 0;
	for (const section of SECTIONS) {
		const list: Rendered[] = [];
		for (const item of section.items) {
			status.textContent = `Rendering ${item.id}…`;
			try {
				const r = await renderItem(item, pictures);
				list.push(r);
				all.push(r);
				if (!r.decoded) failures++;
				log(`${item.id.padEnd(4)} ${r.decoded ? 'decodes' : 'DOES NOT DECODE'}  v${r.version} ${r.moduleMm.toFixed(2)} mm modules  ${item.what}${r.note ? `  (${r.note})` : ''}`, r.decoded);
			} catch (e) {
				log(`${item.id} failed: ${e instanceof Error ? e.message : String(e)}`, false);
				throw e;
			}
		}
		rendered.set(section.code, list);
	}

	status.textContent = 'Building the PDF…';
	const doc = await PDFDocument.create();
	doc.setTitle('StoneQR scan sheets');
	doc.setProducer('StoneQR');
	doc.setCreator('stoneqr.app · bun run scan-sheets');
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);
	const sheet = new Sheet(doc, font, bold, built);

	sheet.newPage();
	sheet.text('StoneQR scan sheets', MARGIN, sheet.y, 20, bold);
	sheet.y += 10;
	for (const l of sheet.wrap(
		`Every code the scan matrix in docs/scan-matrix.md asks for, labelled with its row ID, plus a page of deliberately risky codes (section L). Each URL code opens stoneqr.app/?s=<ID>, so the phone tells you which one it read. "Software decode" is the engine's own check on the file; the point of printing is to find where paper, ink, and cameras disagree with it. Print on plain paper at 100% on a laser printer first; an inkjet print is the second pass. Score on the last pages, then copy into the matrix.${photo.synthetic ? ' The Photo QR rows use a painted stand-in picture; run the script with --photo to use a real photograph.' : ''}`,
		9,
		font,
		CONTENT_W
	)) {
		sheet.text(l, MARGIN, sheet.y, 9, font, GREY);
		sheet.y += 4.2;
	}
	sheet.y += 2;

	for (const section of SECTIONS) {
		const list = rendered.get(section.code)!;
		const inline = list.filter((r) => !r.item.tile);
		const first = inline[0];
		sheet.heading(section, first ? first.item.mm * first.scale * first.aspect + 18 : 20);
		if (inline.length) await sheet.flow(inline);
	}
	const phones = ['iPhone', 'Android', 'Lens'];
	sheet.scoreSheet(all, phones);
	for (const r of all.filter((r) => r.item.tile)) await sheet.tiles(r);
	sheet.numberPages();

	const bytes = await doc.save();
	await fetch('/save', { method: 'POST', body: bytes });
	status.textContent = `Done: ${all.length} codes on ${sheet.pages.length} pages, ${failures} failed the software decode. docs/scan-sheets.pdf is written; you can close this tab.`;
}

main().catch((e) => {
	status.textContent = `Failed: ${e instanceof Error ? e.message : String(e)}`;
	console.error(e);
});
