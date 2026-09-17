/**
 * Draw the favicon set from the same design as apps/site/static/favicon.svg.
 *
 *   bun run icons
 *
 * No browser or image library: the mark is four axis-aligned rectangles and one rounded
 * corner, so this samples the drawing directly (8x8 subsamples per pixel) and writes PNGs
 * with the engine's own encoder. Outputs, all in apps/site/static/:
 *
 *   favicon.ico            16, 32, 48 (PNG-in-ICO; Google Search reads the 48)
 *   apple-touch-icon.png   180, opaque, square corners (iOS rounds them itself)
 *   icon-192.png, icon-512.png     web manifest, purpose "any"
 *   icon-maskable-512.png          web manifest, purpose "maskable" (art inside the safe zone)
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from '@stoneqr/engine/export/png';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/site/static');

// The drawing, in the SVG's 24-unit space. Same values as favicon.svg.
const INK = [0x13, 0x16, 0x18]; // basalt
const PAPER = [0xe6, 0xe2, 0xd8]; // limestone
const ACCENT = [0x5c, 0xca, 0xa5]; // copper verdigris
const RADIUS = 3;

/** Colour at a point of the 24-unit drawing, or null outside the rounded square. */
function sample(u, v, { rounded, scale }) {
	if (rounded) {
		const r = RADIUS;
		const cx = u < r ? r : u > 24 - r ? 24 - r : u;
		const cy = v < r ? r : v > 24 - r ? 24 - r : v;
		if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return null;
	}
	// Maskable icons keep the art inside the central 80% circle, so shrink it about the centre.
	const x = 12 + (u - 12) / scale;
	const y = 12 + (v - 12) / scale;
	if (x >= 10 && x < 14 && y >= 10 && y < 14) return ACCENT;
	if (x >= 8 && x < 16 && y >= 8 && y < 16) return INK;
	if (x >= 5 && x < 19 && y >= 5 && y < 19) return PAPER;
	return INK;
}

function draw(size, opts) {
	const ss = 8;
	const data = new Uint8Array(size * size * 4);
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			let r = 0, g = 0, b = 0, a = 0;
			for (let sy = 0; sy < ss; sy++) {
				for (let sx = 0; sx < ss; sx++) {
					const u = ((px + (sx + 0.5) / ss) / size) * 24;
					const v = ((py + (sy + 0.5) / ss) / size) * 24;
					const c = sample(u, v, opts);
					if (!c) continue;
					r += c[0]; g += c[1]; b += c[2]; a += 1;
				}
			}
			const o = (py * size + px) * 4;
			if (a) {
				data[o] = Math.round(r / a);
				data[o + 1] = Math.round(g / a);
				data[o + 2] = Math.round(b / a);
				data[o + 3] = Math.round((a / (ss * ss)) * 255);
			}
		}
	}
	return encodePng({ width: size, height: size, data });
}

/** ICO container holding PNG entries (supported by every current browser and Windows Vista+). */
function ico(pngs) {
	const header = 6 + 16 * pngs.length;
	let offset = header;
	const out = [];
	const dir = new Uint8Array(header);
	const view = new DataView(dir.buffer);
	view.setUint16(2, 1, true);
	view.setUint16(4, pngs.length, true);
	pngs.forEach(({ size, png }, i) => {
		const e = 6 + i * 16;
		dir[e] = size === 256 ? 0 : size;
		dir[e + 1] = size === 256 ? 0 : size;
		view.setUint16(e + 4, 1, true);
		view.setUint16(e + 6, 32, true);
		view.setUint32(e + 8, png.length, true);
		view.setUint32(e + 12, offset, true);
		offset += png.length;
		out.push(png);
	});
	return Buffer.concat([dir, ...out]);
}

const rounded = { rounded: true, scale: 1 };
const square = { rounded: false, scale: 1 };
const maskable = { rounded: false, scale: 0.8 };

const files = {
	'favicon.ico': ico([16, 32, 48].map((size) => ({ size, png: draw(size, rounded) }))),
	'apple-touch-icon.png': draw(180, square),
	'icon-192.png': draw(192, rounded),
	'icon-512.png': draw(512, rounded),
	'icon-maskable-512.png': draw(512, maskable)
};
for (const [name, bytes] of Object.entries(files)) {
	writeFileSync(resolve(outDir, name), bytes);
	console.log(`${name}\t${bytes.length} B`);
}
