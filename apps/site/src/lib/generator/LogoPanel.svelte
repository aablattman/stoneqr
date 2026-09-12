<script lang="ts">
	/**
	 * The centre logo: a picture in the middle of the code with the modules cleared around it.
	 *
	 * It used to be the third group inside Style, which starts folded, while the Artistic QR panel
	 * below it offered to "blend a photo or a logo". Someone with a logo in hand read the only
	 * heading that mentioned one and got a halftone. The logo is the customisation most people
	 * arrive for, so it is its own panel, first in the column and open from the start; its empty
	 * state is one drop tile, which costs almost nothing to show.
	 */
	import { untrack } from 'svelte';
	import { LOGO_BLOCK_COVER, LOGO_WARN_COVER } from '@stoneqr/engine';
	import { isSvgFile, pictureFileProblem } from './pictures';
	import { fitLogo, logoTreads, sameTread, LOGO_WIDTH_DEFAULT, LOGO_WIDTH_MAX, LOGO_WIDTH_MIN, type LogoFit } from '$lib/logo-size';
	import { FULL_CROP, LOGO_ZOOM_MAX, LOGO_ZOOM_MIN, cropZoom, freeCropModel, isFullCrop, zoomCrop } from '$lib/logo-crop';
	import type { CropRect } from '$lib/crop';
	import CropBox from '$lib/components/CropBox.svelte';
	import { preloadStyled } from '$lib/styled';
	import { LOGO_ICONS, logoIconArt, logoIconByName, logoIconDataUrl, logoIconName, type LogoIcon } from '$lib/logo-icons';
	import DropTile from '$lib/components/DropTile.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import Slider from '$lib/components/Slider.svelte';
	import type { Design } from './state.svelte';

	let { design, open = true, advanced = false }: { design: Design; open?: boolean; advanced?: boolean } = $props();

	/** The panel's own open state; see SectionHeader for why it is not bound straight to the prop. */
	let panelOpen = $state(untrack(() => open));

	/** An Artistic QR picture owns the whole code, so there is no middle for a logo while it is on. */
	const off = $derived(design.halftoneActive);

	/**
	 * What the logo actually came out as, never what the slider asked for. A hole is a whole odd
	 * number of modules, so the reachable widths are a staircase and the readout steps with them.
	 * Basic gets the width alone; Advanced also gets the share of the code the logo hides, which
	 * is the number the error correction cares about and the one the warnings are set against.
	 */
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const treadReadout = (t: LogoFit) => (advanced ? `${pct(t.width)} of width · hides ${pct(t.cover)}` : `${pct(t.width)} of width`);
	/** Until there is content, or while Artistic QR owns the code, there is no staircase to land on: what was asked is what comes back when the logo does. */
	const askedReadout = $derived(`${pct(design.logoWidth)} of width`);

	/**
	 * The code the hole is being cut in, as the sizing port wants it. Null until there is a code
	 * to cut, or while Artistic QR owns it.
	 */
	const holeInput = $derived(
		design.encoded && !off
			? {
					modules: design.encoded.size,
					version: design.encoded.version,
					ecc: design.ecc,
					margin: design.effectiveLogoMargin,
					aspect: design.logoHoleAspect
				}
			: null
	);
	/**
	 * The sizes this code can actually produce for this logo, smallest first. The Size slider
	 * steps through these, one tread per position, rather than sliding over a range where most
	 * positions changed nothing and the readout jumped when one finally did. `logoWidth` stays
	 * the width asked for, so the same design lands on the nearest tread of whatever code the
	 * content produces next.
	 */
	const treads = $derived(holeInput ? logoTreads(holeInput) : []);
	const treadIndex = $derived.by(() => {
		const i = treads.findIndex((t) => sameTread(t, design.logoFit));
		if (i >= 0) return i;
		// Asked for a width no offered tread answers to: the nearest one is the honest position.
		let best = 0;
		treads.forEach((t, j) => {
			if (Math.abs(t.width - design.logoWidth) < Math.abs(treads[best]!.width - design.logoWidth)) best = j;
		});
		return best;
	});
	/** Where the default width lands on this code, so the slider's reset dot means the same thing everywhere. */
	const defaultIndex = $derived.by(() => {
		if (!holeInput) return 0;
		const fit = fitLogo(LOGO_WIDTH_DEFAULT, holeInput);
		const i = treads.findIndex((t) => sameTread(t, fit));
		return i >= 0 ? i : 0;
	});
	function setTread(i: number) {
		const at = Math.round(i);
		const t = treads[at];
		if (!t) return;
		// The default tread writes the default itself, so a design left there stays out of share links.
		design.logoWidth = at === defaultIndex ? LOGO_WIDTH_DEFAULT : Math.round(t.width * 1000) / 1000;
	}
	const coverClass = $derived(design.logoCover > LOGO_BLOCK_COVER ? 'text-block' : design.logoCover > LOGO_WARN_COVER ? 'text-warn' : '');

	/** The crop: the box on the thumbnail is the blank space, and its four fields live on the design. */
	function setCrop(c: CropRect) {
		design.logoCropX = c.u;
		design.logoCropY = c.v;
		design.logoCropW = c.w;
		design.logoCropH = c.h;
	}
	const resetCrop = () => setCrop(FULL_CROP);
	const cropChanged = $derived(!isFullCrop(design.logoCrop));
	const cropModel = freeCropModel(() => design.logoCrop, setCrop);

	/** What the folded panel says, so nothing is hidden by folding. */
	const summary = $derived.by(() => {
		if (!design.logo) return '';
		if (off) return 'Off: Artistic QR';
		// Painting over the modules is the unusual choice, so a folded panel says so.
		return [design.logoName, cropChanged ? 'cropped' : '', design.logoKnockout ? '' : 'over modules'].filter(Boolean).join(' · ');
	});

	/**
	 * A wide wordmark is fitted to the width, so it comes out as a thin strip. The hole follows
	 * the crop, so this is the cropped picture's shape (height over width), and cropping the box
	 * down to the mark is the cure the hint offers.
	 */
	const wide = $derived(!!design.logo && design.logoHoleAspect < 0.5);

	/** The built-in icon the logo is, if it is one. */
	const icon = $derived(logoIconByName(design.logoName));

	/**
	 * An icon is drawn in the code colour and keeps following it, and is rebuilt from its name
	 * when a share link or a design file brings the name without the picture. Comparing first
	 * keeps a restored or unchanged icon from being written back on every run.
	 */
	$effect(() => {
		if (!icon) return;
		const url = logoIconDataUrl(icon, design.fg);
		if (design.logo !== url) design.logo = url;
	});

	let logoError = $state('');
	/** Things worth telling someone about the file they just dropped, shown under the tile. */
	let logoNotes = $state<string[]>([]);

	async function onLogo(file: File) {
		logoError = '';
		logoNotes = [];
		// The same rules a design file is held to; see `pictures.ts`.
		const problem = pictureFileProblem('logo', file);
		if (problem) {
			logoError = problem;
			return;
		}
		try {
			const notes: string[] = [];
			if (isSvgFile(file)) {
				// An uploaded SVG is a document, not a picture: it is rebuilt before anything sees
				// it. Loaded on demand so the work stays out of the generator's first chunk.
				const { prepareSvgLogo } = await import('$lib/logo-svg');
				const prepared = prepareSvgLogo(await file.text());
				design.logo = prepared.dataUrl;
				notes.push(...prepared.notes);
			} else {
				design.logo = await new Promise<string>((res, rej) => {
					const r = new FileReader();
					r.onload = () => res(String(r.result));
					r.onerror = () => rej(new Error('Could not read the file'));
					r.readAsDataURL(file);
				});
			}
			design.logoName = file.name;
			// A new picture: the last one's crop means nothing on it.
			resetCrop();
			// Dropping a logo says what is wanted. Leaving the picture on would show no logo at all,
			// so the blend is switched off, the picture kept, and the switch named.
			if (design.halftoneActive) {
				design.halftone = false;
				notes.push('Artistic QR was switched off so the logo shows. Your picture is kept; switch it back on under Artistic QR.');
			}
			logoNotes = notes;
		} catch (e) {
			logoError = e instanceof Error ? e.message : String(e);
		}
	}

	/** Picking an icon is an upload by other means, so it follows the same rules, the blend switch included. */
	function useIcon(pick: LogoIcon) {
		logoError = '';
		const notes: string[] = [];
		design.logo = logoIconDataUrl(pick, design.fg);
		design.logoName = logoIconName(pick);
		design.logoAspect = 1;
		resetCrop();
		if (design.halftoneActive) {
			design.halftone = false;
			notes.push('Artistic QR was switched off so the icon shows. Your picture is kept; switch it back on under Artistic QR.');
		}
		logoNotes = notes;
	}

	function clearLogo() {
		logoNotes = [];
		design.logo = undefined;
		design.logoName = '';
		design.logoAspect = 1;
		resetCrop();
		logoError = '';
	}
</script>

<SectionHeader title="Logo" collapsible bind:open={panelOpen} {summary} controls="logo-body" onopen={preloadStyled} />

{#if panelOpen}
	<div id="logo-body" class="mt-4 grid gap-3">
		{#if off && design.logo}
			<p class="notice notice-info">
				<span>
					Artistic QR is on, and it fills the whole code, so the logo is not shown.
					<button type="button" class="underline" onclick={() => (design.halftone = false)}>Show the logo instead</button>
				</span>
			</p>
		{/if}
		<DropTile
			src={design.logo ?? ''}
			name={design.logoName}
			accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg"
			label="Drop your logo here, or choose a file"
			hint="It sits in the middle of the code with clear space around it. PNG, JPEG, WebP, or SVG; it stays in your browser."
			error={logoError}
			ariaLabel="Upload a logo"
			onfile={onLogo}
			onclear={clearLogo}
		/>
		<!-- Offered while there is no logo, and kept while the logo is one of these so switching
		     between them is one click; an uploaded logo hides the row, since Remove comes first. -->
		{#if !design.logo || icon}
			<div class="field">
				<span class="label">{design.logo ? 'Icon' : 'No logo? Use an icon'}</span>
				<div class="grid grid-cols-6 gap-1.5">
					{#each LOGO_ICONS as i (i.id)}
						<button
							type="button"
							class="swatch"
							title={i.label}
							aria-label={`Use the ${i.label} icon`}
							aria-pressed={icon?.id === i.id}
							data-on={icon?.id === i.id}
							onclick={() => useIcon(i)}
						>
							<span class="swatch-art p-1">{@html logoIconArt(i)}</span>
						</button>
					{/each}
				</div>
				{#if icon}<p class="hint">Icons are drawn in the code colour and change with it.</p>{/if}
			</div>
		{/if}
		{#each logoNotes as note (note)}
			<p class="notice notice-info">{note}</p>
		{/each}
		{#if design.logo}
			<!-- Not in force while Artistic QR owns the code, so these are disabled then, not hidden:
			     they come back as they were the moment the blend is switched off. -->
			<fieldset
				disabled={off}
				aria-disabled={off}
				class="m-0 grid min-w-0 gap-3 border-0 p-0 transition-opacity {off ? 'pointer-events-none opacity-40 select-none' : ''}"
			>
				<!-- Not for a built-in icon, which is drawn to fill its box already. The crop is the
				     Artistic QR crop's sibling, free in shape and bounded to the picture: the box is
				     the blank space, and the hole is cut to its shape. -->
				{#if !icon}
					<div class="grid gap-3">
						<p class="subhead">Crop</p>
						<CropBox
							src={design.logo}
							model={cropModel}
							disabled={off}
							label="Crop. Drag the box to choose the part of the picture that goes in the code, or use the arrow keys; drag its corner to change its size and shape, holding Shift to keep the shape, or press plus and minus to zoom."
						/>
						<Slider
							label="Zoom"
							bind:value={() => cropZoom(design.logoCrop), (z) => setCrop(zoomCrop(design.logoCrop, z))}
							min={LOGO_ZOOM_MIN}
							max={LOGO_ZOOM_MAX}
							step={0.05}
							reset={1}
							format={(v) => `${v.toFixed(2)}×`}
						/>
						<p class="hint">
							The box is the blank space in the middle of the code. Drag it to choose what goes there, and drag its
							corner to change its size and shape; the space takes the shape of the box.
							{#if cropChanged}<button type="button" class="underline" onclick={resetCrop}>Reset crop</button>{/if}
						</p>
					</div>
				{/if}
				{#if !holeInput}
					<Slider
						label="Size"
						bind:value={design.logoWidth}
						min={LOGO_WIDTH_MIN}
						max={LOGO_WIDTH_MAX}
						step={0.01}
						reset={LOGO_WIDTH_DEFAULT}
						format={() => askedReadout}
					/>
				{:else if treads.length >= 2}
					<!-- One position per size the code can produce, so every step of the slider changes the logo. -->
					<Slider
						label="Size"
						bind:value={() => treadIndex, setTread}
						min={0}
						max={treads.length - 1}
						step={1}
						reset={defaultIndex}
						format={(i) => treadReadout(treads[Math.round(i)] ?? treads[0]!)}
						readoutClass={coverClass}
					/>
				{:else}
					<div class="row">
						<span class="row-label">Size</span>
						<p class="hint">{treads.length ? 'The only size that fits this code.' : 'No room for a logo on this code.'}</p>
						<div class="row-readout"><span class="num {coverClass}">{treads.length ? treadReadout(treads[0]!) : 'no room'}</span></div>
					</div>
				{/if}
				{#if design.logoKnockout}
					<Slider label="Margin" bind:value={design.logoMargin} min={0} max={3} step={1} reset={1} format={(v) => `${v} mod`} />
				{/if}
				<label class="toggle">
					<input type="checkbox" role="switch" bind:checked={design.logoKnockout} />
					Clear space behind the logo
				</label>
				<p class="hint">
					{#if design.logoKnockout}
						The squares under the logo are removed and the code's built-in error correction fills them back in, so
						the logo stays clear and the code still scans.
					{:else}
						The logo is painted straight over the code, so nothing is cleared for it. Watch the decode badge.
					{/if}
					{#if advanced}Error correction is set to H while a logo is present.{/if}
				</p>
				{#if wide}
					<p class="hint">
						A wide logo is fitted to the width of the space, so it comes out short. Crop the box down to the mark
						or monogram if there is one, or use a square or round version: it fills the middle better and reads
						from further away.
					</p>
				{/if}
			</fieldset>
		{/if}
	</div>
{/if}
