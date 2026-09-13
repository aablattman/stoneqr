import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unzlibSync } from 'fflate';
import { verifyRaster } from '@stoneqr/engine';
import { OG_ROUTES } from '../../../scripts/og/routes.mjs';
import { CODE_BOX } from '../../../scripts/og/card.js';
import { OG_IMAGES } from '$lib/og-images';
import { SITE } from '$lib/site';

/**
 * A shared link with a 404 card is worse than a generic one, so the manifest the site reads,
 * the files on disk, and the routes in the sitemap all have to agree. Regenerate with
 * `bun run og` after adding a route.
 */
const staticDir = new URL('../static/', import.meta.url);

function readPng(path: string): Buffer {
	const png = readFileSync(fileURLToPath(new URL(path, staticDir)));
	expect([...png.subarray(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG');
	return png;
}

function pngSize(path: string): { width: number; height: number } {
	const png = readPng(path);
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Minimal PNG reader: 8-bit RGB or RGBA, every filter type, no interlacing. */
function decodePng(png: Buffer): { width: number; height: number; channels: number; data: Uint8Array } {
	const width = png.readUInt32BE(16);
	const height = png.readUInt32BE(20);
	expect(png[24], 'bit depth').toBe(8);
	const channels = png[25] === 6 ? 4 : 3;
	expect(png[25], 'colour type').toBeOneOf([2, 6]);
	expect(png[28], 'interlace').toBe(0);

	const idat: Uint8Array[] = [];
	for (let o = 8; o + 8 <= png.length; ) {
		const len = png.readUInt32BE(o);
		if (png.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + len));
		o += 12 + len;
	}
	const raw = unzlibSync(Buffer.concat(idat));
	const stride = width * channels;
	const out = new Uint8Array(height * stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)]!;
		const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? out[y * stride + i - channels]! : 0;
			const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
			const c = y > 0 && i >= channels ? out[(y - 1) * stride + i - channels]! : 0;
			let add = 0;
			if (filter === 1) add = a;
			else if (filter === 2) add = b;
			else if (filter === 3) add = (a + b) >> 1;
			else if (filter === 4) {
				const p = a + b - c;
				const pa = Math.abs(p - a);
				const pb = Math.abs(p - b);
				const pc = Math.abs(p - c);
				add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			out[y * stride + i] = (line[i]! + add) & 0xff;
		}
	}
	return { width, height, channels, data: out };
}

/** Cut the code back out of the card, as RGBA, so the decoder sees only the symbol. */
function cropCode(image: { width: number; channels: number; data: Uint8Array }): {
	width: number;
	height: number;
	data: Uint8Array;
} {
	const side = CODE_BOX.side;
	const data = new Uint8Array(side * side * 4);
	for (let y = 0; y < side; y++) {
		for (let x = 0; x < side; x++) {
			const src = ((CODE_BOX.y + y) * image.width + CODE_BOX.x + x) * image.channels;
			const dst = (y * side + x) * 4;
			data[dst] = image.data[src]!;
			data[dst + 1] = image.data[src + 1]!;
			data[dst + 2] = image.data[src + 2]!;
			data[dst + 3] = 255;
		}
	}
	return { width: side, height: side, data };
}

const sitemapPaths = [...readFileSync(fileURLToPath(new URL('sitemap.xml', staticDir)), 'utf8').matchAll(/<loc>https:\/\/stoneqr\.app(\/[^<]*)<\/loc>/g)].map(
	([, path]) => path!
);

describe('Open Graph cards', () => {
	it('covers every route in the sitemap', () => {
		expect(sitemapPaths.length).toBeGreaterThan(1);
		for (const path of sitemapPaths) {
			const slug = path.replace(/^\/|\/$/g, '');
			if (slug === '') continue; // the home card is static/og.png
			expect(OG_IMAGES.has(slug), `${path} has no Open Graph card; run bun run og`).toBe(true);
		}
	});

	it('has a 1200x630 file for the home card and every listed slug', () => {
		expect(pngSize('og.png')).toEqual({ width: 1200, height: 630 });
		for (const slug of OG_IMAGES) {
			expect(pngSize(`og/${slug}.png`), slug).toEqual({ width: 1200, height: 630 });
		}
	});

	it('carries a code on the home card that decodes to the site', () => {
		const image = cropCode(decodePng(readPng('og.png')));
		expect(verifyRaster(image, SITE.url)).toEqual({ ok: true, decoded: SITE.url });
	});

	it('carries a code that decodes to its own page', () => {
		for (const route of OG_ROUTES) {
			const image = cropCode(decodePng(readPng(`og/${route.slug}.png`)));
			expect(verifyRaster(image, `${SITE.url}${route.path}`), route.slug).toEqual({
				ok: true,
				decoded: `${SITE.url}${route.path}`
			});
		}
	});

	it('matches the generator, so the manifest cannot go stale', () => {
		expect([...OG_IMAGES].sort()).toEqual(OG_ROUTES.map((r) => r.slug).sort());
		for (const route of OG_ROUTES) {
			expect(sitemapPaths, `${route.path} is drawn but not in the sitemap`).toContain(route.path);
		}
	});
});
