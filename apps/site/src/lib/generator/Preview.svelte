<script lang="ts">
	import { rasterize, verifyRasterAsync, type RasterImage } from '@stoneqr/engine';
	import { renderStyled } from '$lib/styled';
	import { svgToCanvas, canvasImageData } from '$lib/svg-raster';
	import { SITE } from '$lib/site';
	import Icon from '$lib/components/Icon.svelte';
	import { describe, type Design } from './state.svelte';

	let { design, advanced = false }: { design: Design; advanced?: boolean } = $props();

	/**
	 * Advanced only: draw the code at the print width it will actually be, using CSS millimetres,
	 * with a 10 mm bar to check it against a ruler. It is a preview affordance and nothing more —
	 * exports and the decode check never see it.
	 */
	let actualSize = $state(false);
	/** The artwork's real width: the code, plus the frame band when there is one. */
	const artWidthMm = $derived(design.widthMm * (design.styled ? design.styledScale : 1));
	const sizeStyle = $derived(actualSize ? `width: min(100%, ${artWidthMm}mm); height: auto` : '');

	const svg = $derived(design.styled ? design.styledSvg : design.plainSvg);

	// Artistic (halftone) rendering, plan §7. Takes precedence over plain and styled output.
	// The picture is decoded once per data URL and never leaves the browser.
	let halftoneError = $state('');
	let halftoneBusy = $state(false);
	let imageCache: { key: string; raster: RasterImage } | null = null;
	let halftoneSeq = 0;

	async function imageFor(dataUrl: string): Promise<RasterImage> {
		if (imageCache?.key === dataUrl) return imageCache.raster;
		const { loadImageRaster } = await import('$lib/halftone');
		const raster = await loadImageRaster(dataUrl);
		imageCache = { key: dataUrl, raster };
		return raster;
	}

	$effect(() => {
		const qr = design.encoded;
		const payload = design.payload;
		const image = design.halftoneImage;
		if (!design.halftoneActive || !qr || !payload || !image) {
			design.halftoneRaster = null;
			design.halftoneOpts = null;
			design.halftoneNote = '';
			halftoneError = '';
			halftoneBusy = false;
			return;
		}
		const opts = {
			pxPerModule: 8,
			quietZone: design.quietZone,
			// The code and background colours, which the renderer has always taken and the site never passed
			// (audit 2026-09-06). The worker, the SVG download, and the decode check all copy these options.
			dark: hexToRgb(design.fg),
			light: design.transparentBg ? ([255, 255, 255] as [number, number, number]) : hexToRgb(design.bg),
			dotScale: design.halftoneDotScale,
			imageDim: design.halftoneDim,
			grayscale: design.halftoneGrayscale,
			contrast: design.halftoneContrast,
			threshold: design.halftoneSilhouette ? design.halftoneThreshold : undefined,
			imageZoom: design.halftoneZoom,
			imageOffsetX: design.halftoneOffsetX,
			imageOffsetY: design.halftoneOffsetY
		};
		design.verify = 'checking';
		halftoneBusy = true;
		const seq = ++halftoneSeq;
		const t = setTimeout(async () => {
			try {
				const [{ halftoneWithFallback }, { rasterToPngBlob }, source] = await Promise.all([
					import('@stoneqr/engine'),
					import('$lib/halftone'),
					imageFor(image)
				]);
				const result = halftoneWithFallback(qr, source, payload, opts);
				if (seq !== halftoneSeq) return;
				design.halftoneRaster = result.raster;
				design.halftoneOpts = result.opts;
				design.halftoneNote = result.note;
				design.verify = result.ok ? 'ok' : 'fail';
				design.verifyDetail = result.ok ? '' : result.note;
				halftoneError = '';
				const url = URL.createObjectURL(await rasterToPngBlob(result.raster));
				if (seq !== halftoneSeq) {
					URL.revokeObjectURL(url);
					return;
				}
				if (design.halftonePreviewUrl) URL.revokeObjectURL(design.halftonePreviewUrl);
				design.halftonePreviewUrl = url;
			} catch (e) {
				if (seq !== halftoneSeq) return;
				halftoneError = e instanceof Error ? e.message : String(e);
				design.verify = 'fail';
				design.verifyDetail = halftoneError;
			} finally {
				if (seq === halftoneSeq) halftoneBusy = false;
			}
		}, 300);
		return () => clearTimeout(t);
	});

	// Drop the object URL when the picture goes away or the component unmounts.
	$effect(() => {
		if (design.halftoneActive) return;
		if (design.halftonePreviewUrl) {
			URL.revokeObjectURL(design.halftonePreviewUrl);
			design.halftonePreviewUrl = '';
		}
	});
	$effect(() => () => {
		if (design.halftonePreviewUrl) URL.revokeObjectURL(design.halftonePreviewUrl);
	});

	/**
	 * The logo's shape decides how the library cuts the hole, so the size prediction in
	 * `logo-size.ts` needs it. Measure it from the picture itself rather than trusting what was
	 * stored, so a design restored from a file, a saved record, or an older format is right too.
	 * Until it resolves the design assumes a square, which is correct for most logos and off by a
	 * readout tick for the rest.
	 */
	let aspectFor = '';
	$effect(() => {
		const src = design.logo;
		if (!src) {
			// Leave the aspect alone: on a reload the logo arrives from IndexedDB after the settings,
			// and resetting here threw the restored value away. Clearing the logo resets it instead.
			aspectFor = '';
			return;
		}
		if (src === aspectFor) return;
		let live = true;
		const img = new Image();
		img.onload = () => {
			if (!live || !img.naturalWidth || !img.naturalHeight) return;
			aspectFor = src;
			design.logoAspect = img.naturalHeight / img.naturalWidth;
		};
		img.src = src;
		return () => {
			live = false;
		};
	});

	// Styled rendering: re-render when any style input changes (lazy chunk loads on first use).
	let styledSeq = 0;
	$effect(() => {
		if (!design.styled || !design.encoded) {
			design.styledSvg = '';
			design.styledError = '';
			return;
		}
		const opts = {
			payload: design.payload,
			ecc: design.ecc,
			version: design.encoded.version,
			quietZone: design.quietZone,
			fg: design.fg,
			bg: design.bgColor,
			cornerColor: design.cornerColor ?? undefined,
			dot: design.dot,
			cornerSquare: design.cornerSquare,
			cornerDot: design.cornerDot,
			gradient: design.gradient,
			gradientTo: design.gradientTo,
			gradientAngleDeg: design.gradientAngleDeg,
			logo: design.logo,
			logoCoefficient: design.logoFit.coefficient,
			title: `QR code: ${describe(design.type)}`,
			logoKnockout: design.logoKnockout,
			logoMargin: design.logoMargin,
			frame: { enabled: design.frameEnabled, text: design.frameText, color: design.frameColor, textColor: design.frameTextColor }
		};
		const widthMm = design.widthMm;
		const seq = ++styledSeq;
		const t = setTimeout(async () => {
			try {
				const r = await renderStyled(opts, widthMm);
				if (seq !== styledSeq) return;
				design.styledScale = r.scale;
				design.styledSvg = r.svg;
				design.styledError = '';
			} catch (e) {
				if (seq !== styledSeq) return;
				design.styledError = e instanceof Error ? e.message : String(e);
			}
		}, 60);
		return () => clearTimeout(t);
	});

	// Verification: debounced 300 ms; plain codes decode from a canvas-free raster, styled from a canvas.
	let verifySeq = 0;
	$effect(() => {
		const qr = design.encoded;
		const payload = design.payload;
		const styled = design.styled;
		const styledSvg = design.styledSvg;
		const bg = design.bgColor;
		const fg = design.fg;
		if (design.halftoneActive) return; // the halftone effect above owns verification
		if (!qr || !payload || (styled && !styledSvg)) {
			design.verify = 'idle';
			return;
		}
		design.verify = 'checking';
		const seq = ++verifySeq;
		const t = setTimeout(async () => {
			try {
				let ok: boolean;
				if (!styled) {
					const px = 8;
					const img = rasterize(qr, { pxPerModule: px, quietZone: design.quietZone, fg: hexToRgb(fg), bg: bg === 'transparent' ? [255, 255, 255] : hexToRgb(bg) });
					ok = (await verifyRasterAsync(img, payload)).ok;
				} else {
					// Keep 8 px per module for the code itself; a frame makes the artwork wider.
					const side = Math.round((qr.size + 2 * design.quietZone) * 8 * design.styledScale);
					const canvas = await svgToCanvas(styledSvg, side, bg === 'transparent' ? '#ffffff' : undefined);
					const data = canvasImageData(canvas);
					ok = (await verifyRasterAsync(data, payload)).ok;
					if (!ok) {
						// Second attempt at a larger scale, matching a typical phone camera's oversampling.
						const c2 = await svgToCanvas(styledSvg, side * 2, bg === 'transparent' ? '#ffffff' : undefined);
						ok = (await verifyRasterAsync(canvasImageData(c2), payload)).ok;
					}
				}
				if (seq !== verifySeq) return;
				design.verify = ok ? 'ok' : 'fail';
				design.verifyDetail = ok ? '' : styled ? 'The styled code did not decode. Try a larger logo margin, a smaller logo, plainer dots, or more contrast.' : 'This code did not decode. Increase contrast or the quiet zone.';
			} catch (e) {
				if (seq !== verifySeq) return;
				design.verify = 'fail';
				design.verifyDetail = e instanceof Error ? e.message : String(e);
			}
		}, 300);
		return () => clearTimeout(t);
	});

	function hexToRgb(hex: string): [number, number, number] {
		const m = hex.replace('#', '');
		const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6);
		const v = parseInt(n, 16);
		if (Number.isNaN(v)) return [0, 0, 0];
		return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
	}
</script>

<section class="grid gap-4" aria-labelledby="preview-heading">
	<!--
	  The card sits flush with the tops of the Content and Size cards on either side. Its label and
	  the decode badge live in a caption strip along the bottom, like the ticket on a print proof,
	  so nothing sits above the code to push it out of line.
	-->
	<div id="preview-card" class="sheet mx-auto w-full max-w-[min(100%,72vw)] overflow-hidden lg:max-w-none">
		<!-- The stage stays white whatever the background colour: the code carries its own
		     background inside its quiet zone, and a stage painted the same colour made it spill
		     past the code and, with a frame, outside the frame's rounded shape. Transparent shows
		     a checkerboard so the missing background is visible. -->
		<div
			class="relative grid aspect-square w-full grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden p-4"
			style="background: {design.transparentBg ? 'repeating-conic-gradient(#e6e1d6 0 25%, #f4f0e8 0 50%) 0 0 / 16px 16px' : 'white'}"
			role="img"
			aria-label="QR code preview encoding a {describe(design.type)}"
		>
			{#if design.halftoneActive && design.halftonePreviewUrl}
				<img
					src={design.halftonePreviewUrl}
					alt=""
					class="object-contain transition-opacity [image-rendering:pixelated] {actualSize
						? 'max-h-full max-w-full'
						: 'h-full w-full'}"
					style="opacity: {halftoneBusy ? 0.5 : 1}; {sizeStyle}"
				/>
			{:else if design.halftoneActive && halftoneError}
				<p class="notice notice-block max-w-[18rem]">{halftoneError}</p>
			{:else if design.halftoneActive && design.encoded}
				<p class="text-ink-3">Blending the picture…</p>
			{:else if svg}
				<div
					class="qr-host min-h-0 min-w-0 [&>svg]:w-full {actualSize
						? 'max-h-full max-w-full [&>svg]:h-auto'
						: 'h-full w-full [&>svg]:h-full'}"
					style={sizeStyle}
				>
					{@html svg}
				</div>
			{:else if design.isEmpty}
				<div class="grid place-items-center text-center text-ink-3">
					<svg width="120" height="120" viewBox="0 0 21 21" aria-hidden="true" class="opacity-25">
						<rect x="0" y="0" width="7" height="7" fill="currentColor" /><rect x="14" y="0" width="7" height="7" fill="currentColor" /><rect x="0" y="14" width="7" height="7" fill="currentColor" />
						<rect x="2" y="2" width="3" height="3" fill="var(--color-paper)" /><rect x="16" y="2" width="3" height="3" fill="var(--color-paper)" /><rect x="2" y="16" width="3" height="3" fill="var(--color-paper)" />
					</svg>
					<p class="mt-3 max-w-[16rem] text-sm">Type something in the content panel and the code appears here.</p>
				</div>
			{:else if design.encodeError}
				<p class="notice notice-block max-w-[18rem]">{design.encodeError}</p>
			{:else if design.styledError}
				<p class="notice notice-block max-w-[18rem]">{design.styledError}</p>
			{:else}
				<p class="text-ink-3">Rendering…</p>
			{/if}
			{#if actualSize}
				<span class="scale-mark" aria-hidden="true">
					<span class="scale-bar"></span>
					<span class="ticket">10 mm</span>
				</span>
			{/if}
		</div>
		<div class="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-rule px-4 py-2 whitespace-nowrap">
			<!--
			  Between lg and xl the preview column is about 276 px, which is not enough for the
			  label, the Actual size toggle, and the decode badge at once. The label is the least
			  useful of the three next to the code itself, so it goes to screen readers only until
			  there is room. It stays in the DOM either way: the section is labelled by it.
			-->
			<h2 id="preview-heading" class="ticket {advanced ? 'sr-only xl:not-sr-only' : ''}">Preview</h2>
			{#if advanced}
				<label
					class="toggle ml-auto text-xs"
					title="Approximate: browsers work in 96 pixels to the inch, so how close this lands depends on your screen."
				>
					<input type="checkbox" role="switch" bind:checked={actualSize} />
					Actual size
				</label>
			{/if}
			{#if design.verify === 'ok'}
				<span class="badge badge-ok" title="Decoded on your device and matched the content">
					<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.5l2.5 2.5 4.5-5" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
					Scannable
				</span>
			{:else if design.verify === 'fail'}
				<span class="badge badge-block">Did not decode</span>
			{:else if design.verify === 'checking'}
				<span class="badge badge-muted">Checking…</span>
			{/if}
		</div>
	</div>

	{#if design.verify === 'fail' && design.verifyDetail}
		<p class="notice notice-block" role="alert">
			<Icon name="warning" size={15} />
			<span>{design.verifyDetail}</span>
		</p>
	{/if}

	<!--
	  The figures are Advanced only: version, module count, and ECC are the numbers Basic keeps
	  out of sight, and the size list already says what the module size means in words.
	-->
	{#if design.encoded && advanced}
		<!-- Four across, except between lg and xl where the preview column is at its narrowest and
		     the module figure would break across two lines. -->
		<dl class="grid grid-cols-4 gap-2 text-center lg:grid-cols-2 xl:grid-cols-4">
			<div><dt class="ticket">Version</dt><dd class="num">{design.encoded.version}</dd></div>
			<div><dt class="ticket">Modules</dt><dd class="num">{design.encoded.size}</dd></div>
			<div><dt class="ticket">ECC</dt><dd class="num">{design.ecc}</dd></div>
			<div><dt class="ticket">Module</dt><dd class="num">{design.moduleMm.toFixed(2)} mm</dd></div>
		</dl>
	{/if}

	<!-- On a phone this is the first reassurance after the code appears; on a desktop the same
	     line sits under the download buttons a column away, so it shows once. -->
	<p class="text-center text-xs text-ink-3 lg:hidden">{SITE.promise}</p>
</section>
