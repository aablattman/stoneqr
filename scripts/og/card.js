/**
 * Draws one 1200x630 Open Graph card on a 2D canvas, in the site's own palette and fonts: the
 * "set in stone" look (docs/ui-refresh.md §8n). A basalt ground, expanded Archivo lettering,
 * and the code on a limestone tablet, as the generator shows it.
 * Runs in the browser (see generate.mjs); the matrix is handed over by the server so the
 * engine stays the single source of QR truth.
 */
export const CARD = { width: 1200, height: 630 };

/** Where the code sits: the white stage let into the tablet. Exported so tests can crop it back out and decode it. */
export const CODE_BOX = { x: 700, y: 90, side: 450 };

/** The headline and sub live between the wordmark and the cut line. */
const BLOCK = { top: 180, height: 315 };
const HEADLINE_SIZES = [
	{ size: 46, leading: 54 },
	{ size: 40, leading: 48 },
	{ size: 35, leading: 42 }
];

const BASALT = '#131618';
const INK = '#ebe6db';
const INK_2 = '#bdb8ae';
const INK_3 = '#9a958c';
const ACCENT = '#5ccaa5';
const STONE = '#e6e2d8';
const STONE_2 = '#cfc9bc';
const CODE_INK = '#1b1917';

const DISPLAY = 'OG Archivo';
const SANS = 'OG Archivo';

/**
 * @typedef {{ headline: string; sub: string; kicker: string; matrix: boolean[][]; size: number }} Card
 */

/**
 * Break `text` into lines that fit `maxWidth` at the current ctx.font.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string[]}
 */
function wrap(ctx, text, maxWidth) {
	if (text.includes('\n')) return text.split('\n').flatMap((part) => wrap(ctx, part, maxWidth));
	const lines = [];
	let line = '';
	for (const word of text.split(' ')) {
		const next = line ? `${line} ${word}` : word;
		if (line && ctx.measureText(next).width > maxWidth) {
			lines.push(line);
			line = word;
		} else {
			line = next;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/**
 * The ground: flat basalt. No gradients and no grain: Chrome dithers canvas gradients, and the
 * dithered pixels took each PNG from about 80 KB to 500 KB.
 * @param {CanvasRenderingContext2D} ctx
 */
function drawGround(ctx) {
	ctx.fillStyle = BASALT;
	ctx.fillRect(0, 0, CARD.width, CARD.height);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

/**
 * The code itself, on a white stage let into a limestone tablet, with a 4-module quiet zone.
 * @param {CanvasRenderingContext2D} ctx
 * @param {boolean[][]} matrix
 * @param {number} size
 * @param {{ x: number; y: number; side: number }} box
 */
function drawCode(ctx, matrix, size, box) {
	ctx.save();
	const pad = 18;
	// The tablet: a hard dark ledge below it, then the limestone slab with a darker foot and a lit top edge.
	ctx.fillStyle = '#0a0c0d';
	roundRect(ctx, box.x - pad, box.y - pad + 10, box.side + pad * 2, box.side + pad * 2, 16);
	ctx.fill();
	ctx.fillStyle = STONE_2;
	roundRect(ctx, box.x - pad, box.y - pad, box.side + pad * 2, box.side + pad * 2, 16);
	ctx.fill();
	ctx.fillStyle = STONE;
	roundRect(ctx, box.x - pad, box.y - pad, box.side + pad * 2, box.side + pad * 2 - 4, 16);
	ctx.fill();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(box.x - pad + 14, box.y - pad + 1);
	ctx.lineTo(box.x + box.side + pad - 14, box.y - pad + 1);
	ctx.stroke();
	// The stage, with the recess drawn just outside it so the crop the tests take stays pure white.
	ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
	roundRect(ctx, box.x - 2, box.y - 2, box.side + 4, box.side + 4, 6);
	ctx.fill();
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(box.x, box.y, box.side, box.side);

	const quiet = 4;
	const module = Math.floor(box.side / (size + 2 * quiet));
	const drawn = module * size;
	const left = Math.round(box.x + (box.side - drawn) / 2);
	const top = Math.round(box.y + (box.side - drawn) / 2);
	ctx.fillStyle = CODE_INK;
	for (let y = 0; y < size; y++) {
		const row = matrix[y];
		if (!row) continue;
		let x = 0;
		while (x < size) {
			if (!row[x]) {
				x++;
				continue;
			}
			let run = 1;
			while (x + run < size && row[x + run]) run++;
			ctx.fillRect(left + x * module, top + y * module, run * module, module);
			x += run;
		}
	}
	ctx.restore();
}

/**
 * Set a canvas font at the expanded end of Archivo's width axis, or at its normal width.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} weight @param {number} size @param {boolean} expanded
 */
function font(ctx, weight, size, expanded) {
	ctx.fontStretch = expanded ? 'expanded' : 'normal';
	ctx.font = `${expanded ? 'expanded ' : ''}${weight} ${size}px "${expanded ? DISPLAY : SANS}"`;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Card} card
 */
export function drawCard(ctx, card) {
	drawGround(ctx);
	drawCode(ctx, card.matrix, card.size, CODE_BOX);

	const left = 88;
	const column = 540;
	ctx.textBaseline = 'alphabetic';

	// Wordmark, with the accent on QR exactly as the site sets it.
	font(ctx, '800', 34, true);
	ctx.letterSpacing = '-1px';
	ctx.fillStyle = INK;
	ctx.fillText('Stone', left, 128);
	const stoneWidth = ctx.measureText('Stone').width;
	ctx.fillStyle = ACCENT;
	ctx.fillText('QR', left + stoneWidth, 128);

	// Headline and sub are one block, centred between the wordmark and the rule, so a
	// one-line headline like "Two paragraphs." does not leave the card bottom-heavy.
	// Long copy steps the headline down a size rather than running into the rule.
	font(ctx, '400', 24, false);
	ctx.letterSpacing = '0px';
	const sub = wrap(ctx, card.sub, column);
	const subHeight = 22 + sub.length * 34;
	/** @type {string[]} */
	let headline = [];
	let display = HEADLINE_SIZES[HEADLINE_SIZES.length - 1];
	for (const step of HEADLINE_SIZES) {
		font(ctx, '800', step.size, true);
		ctx.letterSpacing = '-1.5px';
		headline = wrap(ctx, card.headline, column);
		display = step;
		if (headline.length * step.leading + subHeight <= BLOCK.height) break;
	}
	const blockHeight = headline.length * display.leading + subHeight;
	let y = BLOCK.top + Math.max(0, (BLOCK.height - blockHeight) / 2) + display.size * 0.84;

	// The headline is lettering cut into the stone: limestone over a hard shadow.
	font(ctx, '800', display.size, true);
	ctx.letterSpacing = '-1.5px';
	for (const line of headline) {
		ctx.fillStyle = '#050607';
		ctx.fillText(line, left, y + 3);
		ctx.fillStyle = INK;
		ctx.fillText(line, left, y);
		y += display.leading;
	}
	ctx.letterSpacing = '0px';

	font(ctx, '400', 24, false);
	ctx.fillStyle = INK_2;
	y += 22;
	for (const line of sub) {
		ctx.fillText(line, left, y);
		y += 34;
	}

	// A cut line: a dark groove with a lit lower lip.
	ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
	ctx.fillRect(left, 524, column, 1);
	ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
	ctx.fillRect(left, 525, column, 1);

	// The kicker keeps to the column: a long one steps down in size rather than reaching the tablet.
	let kickerSize = 14;
	font(ctx, '600', kickerSize, true);
	ctx.letterSpacing = '2.5px';
	while (kickerSize > 10 && ctx.measureText(card.kicker).width > column - 20) {
		kickerSize -= 0.5;
		font(ctx, '600', kickerSize, true);
	}
	ctx.fillStyle = ACCENT;
	ctx.beginPath();
	ctx.arc(left + 4, 558, 4, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = INK_3;
	ctx.fillText(card.kicker, left + 20, 563);
	ctx.letterSpacing = '0px';
}
