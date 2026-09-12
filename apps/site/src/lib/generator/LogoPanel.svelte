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
	import { LOGO_WIDTH_DEFAULT, LOGO_WIDTH_MAX, LOGO_WIDTH_MIN } from '$lib/logo-size';
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
	const logoReadout = $derived.by(() => {
		const fit = design.logoFit;
		// Until there is content, or while Artistic QR owns the code, there is no staircase to land
		// on: show what was asked, which is what comes back when the logo does.
		if (!design.encoded || off) return `${Math.round(design.logoWidth * 100)}% of width`;
		if (!fit.logoW) return 'no room';
		const width = `${Math.round(fit.width * 100)}% of width`;
		return advanced ? `${width} · hides ${Math.round(fit.cover * 100)}%` : width;
	});

	/** What the folded panel says, so nothing is hidden by folding. */
	const summary = $derived.by(() => {
		if (!design.logo) return '';
		if (off) return 'Off: Artistic QR';
		// Painting over the modules is the unusual choice, so a folded panel says so.
		return [design.logoName, design.logoKnockout ? '' : 'over modules'].filter(Boolean).join(' · ');
	});

	/**
	 * A wide wordmark is fitted to the width, so it comes out as a thin strip. `logoAspect` is
	 * height over width, measured by the Preview.
	 */
	const wide = $derived(!!design.logo && design.logoAspect < 0.5);

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
				class="m-0 grid min-w-0 gap-3 border-0 p-0 transition-opacity {off ? 'opacity-40 select-none' : ''}"
			>
				<Slider
					label="Size"
					bind:value={design.logoWidth}
					min={LOGO_WIDTH_MIN}
					max={LOGO_WIDTH_MAX}
					step={0.01}
					reset={LOGO_WIDTH_DEFAULT}
					format={() => logoReadout}
					readoutClass={design.logoCover > LOGO_BLOCK_COVER ? 'text-block' : design.logoCover > LOGO_WARN_COVER ? 'text-warn' : ''}
				/>
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
						A wide logo is fitted to the width of the space, so it comes out short. A square or round version, such
						as your icon or monogram, fills the middle better and reads from further away.
					</p>
				{/if}
			</fieldset>
		{/if}
	</div>
{/if}
