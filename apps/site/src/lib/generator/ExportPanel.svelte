<script lang="ts">
	import { exportPng, exportEps, setPngDpi, fromMm, formatMm, minWidthMmForDistance, maxScanDistanceM, type Ecc } from '@stoneqr/engine';
	import { downloadText, downloadBytes, copyPngToClipboard, slug } from '$lib/download';
	import { svgToCanvas, canvasToPngBlob } from '$lib/svg-raster';
	import { SITE } from '$lib/site';
	import Icon from '$lib/components/Icon.svelte';
	import PreviewBar from '$lib/components/PreviewBar.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import { describe, type Design } from './state.svelte';
	import { snapshot, compact, encodeHash } from './persist';
	import { defaults } from './defaults';
	import { SIZE_TIERS, tierFor, tierFit, tierDistance, formatDistance, formatIn } from './sizes';
	import { halftonePngSize } from './halftone-png';
	import { testSheetSizes, testSheetPage } from './test-sheet';

	let { design, advanced = false }: { design: Design; advanced?: boolean } = $props();

	const canExport = $derived(
		!!design.encoded && design.verify === 'ok' && !design.logoBlocked && design.status !== 'blocked' && design.widthValid
	);
	const svgText = $derived(design.styled ? design.styledSvg : design.plainSvg);
	/** Physical width of the styled artwork: the code width plus the frame when there is one. */
	const artWidthMm = $derived(design.widthMm * (design.styled ? design.styledScale : 1));

	// Basic mode: four named sizes instead of a width field. A width set by hand in Advanced
	// shows up as a fifth, "Custom" row so nothing is silently in force.
	const tier = $derived(tierFor(design.widthMm));
	const fitOf = (mm: number) => (design.encoded ? tierFit(mm, design.encoded.size, design.quietZone) : 'good');
	const fitLabel = { good: '', tight: 'Tight for this content', small: 'Too small for this content' } as const;
	function pickTier(mm: number) {
		design.unit = 'mm';
		design.width = mm;
	}
	/**
	 * Basic hides the two informational sizing lines (module size, reads-to distance) because the
	 * size list already says the same thing in plain words. Warnings and blocks always show.
	 */
	const visibleWarnings = $derived(
		advanced ? design.warnings : design.warnings.filter((w) => !(w.level === 'info' && (w.code === 'scan-distance' || w.code === 'module-size')))
	);
	const name = $derived(`stoneqr-${slug(design.type === 'url' ? design.fields.url.url : describe(design.type))}`);
	const badgeClass = $derived(
		design.status === 'print-safe' ? 'badge-ok' : design.status === 'scannable' ? 'badge-muted' : design.status === 'risky' ? 'badge-warn' : 'badge-block'
	);
	const eccs: Ecc[] = ['L', 'M', 'Q', 'H'];

	const halftoneOnly = 'Artistic QR downloads as PNG or SVG';
	/** The Artistic QR PNG's pixel size and the dpi that prints it at the chosen width (see `halftone-png.ts`). */
	const halftonePng = $derived(
		design.encoded && design.halftoneActive ? halftonePngSize(design.encoded.size + 2 * design.quietZone, design.widthMm, design.dpi) : null
	);
	/** Side of the PNG the button will produce, so Basic can show it instead of a dpi figure. */
	const pngPx = $derived(halftonePng ? halftonePng.widthPx : Math.round((artWidthMm / 25.4) * design.dpi));
	/** What the PNG ticket says: the dpi the file will carry, which differs from the setting only when the Artistic QR cap held. */
	const pngDpiLabel = $derived(halftonePng?.capped ? `${Math.round(halftonePng.dpi)} dpi` : `${design.dpi} dpi`);

	let busy = $state('');
	let copied = $state(false);
	/** Why the last export failed, shown under the buttons rather than in a browser alert. */
	let exportError = $state('');
	/** Live label for the PNG button while a halftone export renders off the main thread. */
	let pngProgress = $state('');

	/**
	 * Every export loads its heavy half lazily, and a hashed chunk stops being served the moment a
	 * new version is published, so a tab left open across a deploy asks for a file that is gone.
	 * The browser records that failure in its module map, which means a retry cannot fix it: only
	 * a reload can. Say that in words rather than showing the module URL.
	 */
	const isStaleChunk = (e: unknown) =>
		/dynamically imported module|Importing a module script failed|module script failed/i.test(
			e instanceof Error ? e.message : String(e)
		);

	async function run(label: string, fn: () => Promise<void>) {
		busy = label;
		exportError = '';
		try {
			await fn();
		} catch (e) {
			exportError = isStaleChunk(e)
				? 'StoneQR was updated while this page was open, so the part that makes this file is no longer on the server. Reload the page and download again. Your design is kept, so it will be where you left it.'
				: `The file could not be made: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			busy = '';
			pngProgress = '';
		}
	}

	const svg = () =>
		run('svg', async () => {
			if (design.halftoneActive && design.encoded && design.halftoneImage) {
				const { halftoneToSvg, loadImageRaster } = await import('$lib/halftone');
				const source = await loadImageRaster(design.halftoneImage);
				const text = halftoneToSvg(design.encoded, source, design.halftoneImage, halftoneOpts(), design.widthMm);
				downloadText(text, `${name}.svg`, 'image/svg+xml');
				return;
			}
			downloadText(svgText, `${name}.svg`, 'image/svg+xml');
		});

	/**
	 * The option set the preview verified, so the export is the code that actually decoded.
	 * Snapshotted: the stored object is a reactive proxy, which cannot be posted to a worker.
	 */
	const halftoneOpts = () => ({ ...($state.snapshot(design.halftoneOpts) ?? {}), quietZone: design.quietZone });

	const png = () =>
		run('png', async () => {
			if (!design.encoded) return;
			if (design.halftoneActive && design.halftoneImage && halftonePng) {
				const { halftonePng: renderHalftonePng } = await import('$lib/halftone-export');
				const { loadImageRaster } = await import('$lib/halftone');
				// Rendered and encoded in a Web Worker so a poster-size raster never freezes the page.
				// The file carries the dpi that prints it at the chosen width from the pixels it has,
				// which is below the setting once the 4096 px cap holds.
				pngProgress = 'Preparing…';
				const bytes = await renderHalftonePng(
					design.encoded,
					await loadImageRaster(design.halftoneImage),
					{ ...halftoneOpts(), pxPerModule: halftonePng.pxPerModule },
					halftonePng.dpi,
					(p) => {
						pngProgress = p.phase === 'render' ? `Rendering ${Math.round(p.fraction * 100)}%` : 'Encoding…';
					}
				);
				downloadBytes(bytes, `${name}-${design.dpi}dpi.png`, 'image/png');
				return;
			}
			if (!design.styled) {
				// `bgColor` is 'transparent' when asked, which the exporter writes as alpha 0, as the SVG, PDF, and EPS already do.
				const r = exportPng(design.encoded, { widthMm: design.widthMm, dpi: design.dpi, quietZone: design.quietZone, fg: design.fg, bg: design.bgColor });
				downloadBytes(r.png, `${name}-${design.dpi}dpi.png`, 'image/png');
			} else {
				const px = Math.round((artWidthMm / 25.4) * design.dpi);
				const canvas = await svgToCanvas(svgText, px);
				const bytes = new Uint8Array(await (await canvasToPngBlob(canvas)).arrayBuffer());
				downloadBytes(setPngDpi(bytes, design.dpi), `${name}-${design.dpi}dpi.png`, 'image/png');
			}
		});

	const pdf = () =>
		run('pdf', async () => {
			if (!design.encoded) return;
			const title = `QR code: ${describe(design.type)}`;
			if (!design.styled) {
				const { exportPdf } = await import('@stoneqr/engine/export/pdf');
				// No page margin: the artboard is the code's printed width, as the SVG and EPS artboards are.
				const bytes = await exportPdf(design.encoded, { widthMm: design.widthMm, marginMm: 0, quietZone: design.quietZone, fg: design.fg, bg: design.bgColor, title, cmyk: true });
				downloadBytes(bytes, `${name}.pdf`, 'application/pdf');
			} else {
				const { styledPdf } = await import('$lib/styled-pdf');
				downloadBytes(await styledPdf(svgText, artWidthMm, { title, bg: design.transparentBg ? undefined : design.bg }), `${name}.pdf`, 'application/pdf');
			}
		});

	const eps = () => {
		if (!design.encoded) return;
		downloadText(exportEps(design.encoded, { widthMm: design.widthMm, quietZone: design.quietZone, fg: design.fg, bg: design.bgColor, title: `QR code: ${describe(design.type)}` }), `${name}.eps`, 'application/postscript');
	};

	const testSheet = () =>
		run('sheet', async () => {
			if (!design.encoded) return;
			const label = `Encodes a ${describe(design.type)} · ECC ${design.ecc} · version ${design.encoded.version}`;
			if (!design.styled) {
				const { exportTestSheet } = await import('@stoneqr/engine/export/pdf');
				downloadBytes(await exportTestSheet(design.encoded, { sizesMm: testSheetSizes(design.widthMm), pageSize: testSheetPage(design.unit, navigator.language), quietZone: design.quietZone, fg: design.fg, bg: design.bgColor, label }), `${name}-test-sheet.pdf`, 'application/pdf');
			} else {
				const { styledTestSheet } = await import('$lib/styled-pdf');
				downloadBytes(
					await styledTestSheet(svgText, {
						sizesMm: testSheetSizes(design.widthMm),
						pageSize: testSheetPage(design.unit, navigator.language),
						label,
						bg: design.transparentBg ? undefined : design.bg,
						moduleCount: design.encoded.size + 2 * design.quietZone,
						scale: design.styledScale
					}),
					`${name}-test-sheet.pdf`,
					'application/pdf'
				);
			}
		});

	/**
	 * The share link: the design's settings and typed content, deflated into the URL fragment. A
	 * fragment never reaches a server, so the promise under the buttons holds; what it does reach
	 * is whoever the link is sent to, which the hint says plainly.
	 */
	let shareLink = $state('');
	let shareCopied = $state(false);
	const share = () =>
		run('share', async () => {
			const hash = await encodeHash(compact(snapshot(design), defaults()));
			shareLink = `${location.origin}/${hash}`;
			try {
				await navigator.clipboard.writeText(shareLink);
				shareCopied = true;
				setTimeout(() => (shareCopied = false), 1600);
			} catch {
				/* no clipboard access: the link is shown below to copy by hand */
			}
		});
	const hasPictures = $derived(!!design.logo || !!design.halftoneImage);

	const copy = () =>
		run('copy', async () => {
			const px = 1024;
			let blob: Blob;
			if (design.halftoneActive && design.halftoneRaster) {
				const { rasterToPngBlob } = await import('$lib/halftone');
				blob = await rasterToPngBlob(design.halftoneRaster);
			} else {
				blob = await canvasToPngBlob(await svgToCanvas(svgText, px, design.transparentBg ? undefined : design.bg));
			}
			const ok = await copyPngToClipboard(blob);
			if (!ok) throw new Error('Clipboard images are not supported in this browser. Download the PNG instead.');
			copied = true;
			setTimeout(() => (copied = false), 1600);
		});

	// The dynamic hand-off to SignUpCity (plan §9) is shelved for now: the link service is on
	// the back burner. The `?short=` return leg in Generator.svelte and the notice in ContentForm
	// stay, so a code made through it still shows what it encodes.
</script>

<section class="grid gap-5" aria-labelledby="export-heading">
	<SectionHeader title="Size and download" id="export-heading">
		{#snippet badge()}
			{#if design.encoded}<span class="badge badge-fixed {badgeClass}">{design.status.replace('-', ' ')}</span>{/if}
		{/snippet}
	</SectionHeader>

	<!-- Print size: how big it will be, and whether that still scans. -->
	<div class="grid gap-3">
		<p class="subhead">Print size</p>
		{#if advanced}
			<div class="grid grid-cols-[1fr_auto] gap-3">
				<div class="field">
					<label for="width">Print width</label>
					<input id="width" class="input num" type="number" min="5" step="1" bind:value={design.width} />
				</div>
				<div class="field">
					<label for="unit">Unit</label>
					<select id="unit" class="select" bind:value={design.unit}>
						<option value="mm">mm</option><option value="cm">cm</option><option value="in">in</option>
					</select>
				</div>
			</div>
			<!-- The same four widths Basic lists, so a size picked in one set is still the chosen one in the other. -->
			<div class="flex flex-wrap gap-1.5">
				{#each SIZE_TIERS as t (t.id)}
					<button type="button" class="chip" data-on={tier?.id === t.id} onclick={() => pickTier(t.mm)}>
						{t.name} {t.mm} mm
					</button>
				{/each}
			</div>
			<div class="field">
				<label for="dist">Read from (metres, optional)</label>
				<input
					id="dist"
					class="input num"
					type="number"
					min="0.1"
					step="0.1"
					placeholder="e.g. 2 for a lobby sign"
					value={design.scanDistanceM ?? ''}
					oninput={(e) => {
						const v = e.currentTarget.value;
						design.scanDistanceM = v === '' ? null : Number(v);
					}}
				/>
			</div>
		{:else}
			<fieldset class="m-0 grid gap-2 border-0 p-0">
				<legend class="sr-only">How big will it be printed?</legend>
				{#each SIZE_TIERS as t (t.id)}
					{@const fit = fitOf(t.mm)}
					{@const on = tier?.id === t.id}
					<label class="tier" data-on={on}>
						<input type="radio" name="size-tier" class="sr-only" value={t.id} checked={on} onchange={() => pickTier(t.mm)} />
						<span class="tier-dot" aria-hidden="true"></span>
						<span class="grid min-w-0 gap-0.5">
							<span class="font-medium">{t.name}</span>
							<span class="text-sm text-ink-2">{t.uses}</span>
							<span class="text-xs text-ink-3">{tierDistance(t)}.</span>
							{#if fit !== 'good'}
								<span class="text-xs font-medium {fit === 'small' ? 'text-block' : 'text-warn'}">{fitLabel[fit]}</span>
							{/if}
						</span>
						<!-- Its own column, so the figures line up down all four cards. -->
						<span class="tier-size">
							<span class="num">{t.mm} mm</span>
							<span class="num">{formatIn(t.mm)} in</span>
						</span>
					</label>
				{/each}
				{#if !tier}
					{@const fit = fitOf(design.widthMm)}
					<label class="tier" data-on={true}>
						<input type="radio" name="size-tier" class="sr-only" value="custom" checked />
						<span class="tier-dot" aria-hidden="true"></span>
						<span class="grid min-w-0 gap-0.5">
							<span class="font-medium">Custom</span>
							<span class="text-sm text-ink-2">Set in Advanced. Pick a size above to replace it.</span>
							{#if fit !== 'good'}
								<span class="text-xs font-medium {fit === 'small' ? 'text-block' : 'text-warn'}">{fitLabel[fit]}</span>
							{/if}
						</span>
						<span class="tier-size">
							<span class="num">{formatMm(design.widthMm)} mm</span>
							<span class="num">{formatIn(design.widthMm, true)} in</span>
						</span>
					</label>
				{/if}
			</fieldset>
		{/if}

		{#if design.styled && design.styledScale > 1}
			<p class="hint">
				With the frame the whole artwork is
				<span class="num">{formatMm(fromMm(artWidthMm, design.unit))} {design.unit}</span> wide; the code inside stays
				{design.width}
				{design.unit}.
			</p>
		{/if}
		{#if design.encoded}
			{#if visibleWarnings.length}
				<ul class="grid gap-2">
					{#each visibleWarnings as w (w.code + w.level + w.message)}
						<li class="notice notice-{w.level}">
							<Icon name={w.level === 'info' ? 'tick' : 'warning'} size={15} />
							<span>{w.message}</span>
						</li>
					{/each}
				</ul>
			{/if}
			{#if design.scanDistanceM}
				<p class="hint">
					For {design.scanDistanceM} m, print at least
					<strong class="num">{formatMm(fromMm(minWidthMmForDistance(design.scanDistanceM), design.unit))} {design.unit}</strong>. At
					the current size it reads to about <span class="num">{formatDistance(maxScanDistanceM(design.widthMm))}</span>.
				</p>
			{/if}
		{/if}
	</div>

	<!-- Encoding: how the symbol itself is built. Advanced only. -->
	{#if advanced}
		<div class="grid gap-3">
			<p class="subhead">Encoding</p>
			<div class="field">
				<span class="label">Error correction</span>
				<div class="seg justify-self-start" role="group" aria-label="Error correction">
					{#each eccs as e (e)}
						<button
							type="button"
							aria-pressed={design.ecc === e}
							disabled={!!design.logo || design.halftoneActive}
							onclick={() => (design.eccChoice = e)}>{e}</button
						>
					{/each}
				</div>
				<p class="hint">
					{design.halftoneActive
						? 'Forced to H while a picture is blended in.'
						: design.logo
							? 'Forced to H while a logo is present, so the hidden modules can be rebuilt.'
							: { L: 'Survives 7% damage. Smallest code.', M: 'Survives 15%. The sensible default.', Q: 'Survives 25%.', H: 'Survives 30%. Needed for logos.' }[design.ecc]}
				</p>
			</div>

			<!-- Three across only once there is room; between lg and xl the column is ~306 px and the
			     mask select loses its own word. -->
			<div class="grid grid-cols-2 gap-3 xl:grid-cols-3">
				<div class="field">
					<label for="quiet">Quiet zone</label>
					<input id="quiet" class="input num" type="number" min="0" max="10" step="1" bind:value={design.quietZone} />
				</div>
				<div class="field">
					<label for="minv">Min version</label>
					<input
						id="minv"
						class="input num"
						type="number"
						min="1"
						max="40"
						step="1"
						bind:value={design.minVersion}
						disabled={design.halftoneActive}
						title={design.halftoneActive ? 'Artistic QR sets its own minimum version' : ''}
					/>
				</div>
				<div class="field col-span-2 xl:col-span-1">
					<label for="mask">Mask</label>
					<select
						id="mask"
						class="select"
						value={String(design.mask)}
						onchange={(e) => {
							const v = e.currentTarget.value;
							design.mask = v === 'auto' ? 'auto' : Number(v);
						}}
					>
						<option value="auto">Auto</option>
						{#each [0, 1, 2, 3, 4, 5, 6, 7] as m (m)}<option value={String(m)}>{m}</option>{/each}
					</select>
				</div>
			</div>
		</div>
	{/if}

	<!-- Files: one obvious download, then the rest in one uniform row. -->
	<div class="grid gap-2">
		<p class="subhead mb-1">Files</p>
		{#if advanced}
			<button type="button" class="btn btn-accent btn-stack" disabled={!canExport || busy === 'svg'} onclick={svg}>
				<span>Download SVG</span><span class="ticket text-paper/70">vector</span>
			</button>
			<div class="grid grid-cols-3 gap-2">
				<button
					type="button"
					class="btn btn-secondary btn-stack"
					disabled={!canExport || busy === 'pdf' || design.halftoneActive}
					title={design.halftoneActive ? halftoneOnly : ''}
					onclick={pdf}
				>
					<span>PDF</span><span class="ticket">{design.styled ? 'raster' : 'CMYK'}</span>
				</button>
				<button type="button" class="btn btn-secondary btn-stack" disabled={!canExport || busy === 'png'} onclick={png} aria-live="polite">
					{#if busy === 'png' && pngProgress}
						<span class="text-xs">{pngProgress}</span>
					{:else}
						<span>PNG</span><span class="ticket">{pngDpiLabel}</span>
					{/if}
				</button>
				<button
					type="button"
					class="btn btn-secondary btn-stack"
					disabled={!canExport || design.styled || design.halftoneActive}
					title={design.halftoneActive ? halftoneOnly : design.styled ? 'EPS is available for the plain square style' : ''}
					onclick={eps}
				>
					<span>EPS</span><span class="ticket">vector</span>
				</button>
			</div>
			<div class="mt-1 grid grid-cols-2 gap-2">
				<button type="button" class="btn btn-secondary btn-sm" disabled={!canExport || busy === 'copy'} onclick={copy}>
					{copied ? 'Copied' : 'Copy PNG'}
				</button>
				<button
					type="button"
					class="btn btn-secondary btn-sm"
					disabled={!canExport || busy === 'sheet' || design.halftoneActive}
					title={design.halftoneActive ? halftoneOnly : ''}
					onclick={testSheet}>Print test sheet</button
				>
			</div>
			<!-- Resolution sits with the files, not with the encoding: it only changes the PNG. -->
			<div class="field mt-1">
				<label for="dpi">PNG detail</label>
				<select id="dpi" class="select" bind:value={design.dpi}>
					<option value={150}>150 dpi (screen)</option>
					<option value={300}>300 dpi (print)</option>
					<option value={600}>600 dpi (fine print)</option>
				</select>
				<p class="hint">
					Makes a <span class="num">{pngPx} px</span> image at this print size.
					{#if halftonePng?.capped}Artistic QR stops at 4096 px a side, so this file carries <span class="num">{Math.round(halftonePng.dpi)} dpi</span> and still prints at the width above.{/if}
				</p>
			</div>
		{:else}
			<!-- Basic: one obvious download, two for specialists, each saying who it is for. -->
			<button type="button" class="btn btn-accent btn-stack" disabled={!canExport || busy === 'png'} onclick={png} aria-live="polite">
				{#if busy === 'png' && pngProgress}
					{pngProgress}
				{:else}
					<span>Download PNG</span><span class="ticket num text-paper/70">{pngPx} px</span>
				{/if}
			</button>
			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class="btn btn-secondary btn-stack"
					disabled={!canExport || busy === 'pdf' || design.halftoneActive}
					title={design.halftoneActive ? halftoneOnly : ''}
					onclick={pdf}
				>
					<span>PDF</span><span class="ticket">print</span>
				</button>
				<button type="button" class="btn btn-secondary btn-stack" disabled={!canExport || busy === 'svg'} onclick={svg}>
					<span>SVG</span><span class="ticket">vector</span>
				</button>
			</div>
			<button type="button" class="btn btn-secondary btn-sm" disabled={!canExport || busy === 'copy'} onclick={copy}>
				{copied ? 'Copied' : 'Copy to clipboard'}
			</button>
			<p class="hint text-center">PNG for documents, slides, and the web. PDF for print shops. SVG for designers.</p>
		{/if}
		{#if design.encoded && !canExport}
			<p class="hint">
				{#if design.verify === 'checking'}Checking that the code decodes…{:else if design.verify === 'fail'}Downloads unlock once the code decodes on your device.{:else if !design.widthValid}Enter a print width to download.{:else if design.logoBlocked}The logo hides too much of the code to print safely. Shrink it to download.{:else}Fix the blocking issue above to download.{/if}
			</p>
		{/if}
		{#if exportError}
			<p class="notice notice-block" role="alert">
				<Icon name="warning" size={15} />
				<span>{exportError}</span>
			</p>
		{/if}
		<p class="text-center text-xs text-ink-3">{SITE.promise}</p>
	</div>

	<hr class="rule" />

	<div class="grid gap-2">
		<p class="ticket">Share this design</p>
		<button type="button" class="btn btn-secondary btn-sm" disabled={busy === 'share'} onclick={share}>
			{shareCopied ? 'Link copied' : 'Copy a link to this design'}
		</button>
		{#if shareLink}
			<input class="input num text-xs" type="text" readonly aria-label="Share link" value={shareLink} onfocus={(e) => e.currentTarget.select()} />
		{/if}
		<p class="hint">
			Opens StoneQR with these settings and this content, including anything typed here{design.type === 'wifi' ? ', the WiFi password too' : ''}. The link is not sent to StoneQR; it lives only with whoever you give it to.{#if hasPictures}{' '}Pictures are not included; send them separately.{/if}
		</p>
	</div>
</section>

<!--
  The phone-only pinned bar. It sits here rather than beside the preview because this is where
  the export actions live, and duplicating them would mean duplicating the worker path, the
  progress readout, and the stale-chunk handling with it. Its primary button mirrors this
  panel's: PNG in Basic, SVG in Advanced.
-->
<PreviewBar
	{design}
	label={advanced ? 'SVG' : 'PNG'}
	disabled={!canExport}
	busy={busy === (advanced ? 'svg' : 'png')}
	onDownload={() => (advanced ? svg() : png())}
/>
