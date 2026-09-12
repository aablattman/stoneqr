<script lang="ts">
	import { untrack } from 'svelte';
	import { contrastRatio, paperColor } from '@stoneqr/engine';
	import { preloadStyled, FRAME, type CornerDotStyle, type CornerSquareStyle, type DotStyle } from '$lib/styled';
	import { LOOKS, type LookId } from '$lib/looks';
	import ColourField from '$lib/components/ColourField.svelte';
	import QrArt from '$lib/components/QrArt.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import Slider from '$lib/components/Slider.svelte';
	import Swatches from '$lib/components/Swatches.svelte';
	import type { Design } from './state.svelte';

	let { design, open = false, advanced = false }: { design: Design; open?: boolean; advanced?: boolean } = $props();

	/**
	 * The panel's own open state. It is deliberately not an attribute driven straight off the
	 * prop: when this was a <details>, Svelte merged every dynamic attribute in the block into one
	 * effect, so `details.open = open` was reassigned whenever any sibling attribute's dependency
	 * changed — ticking "Transparent background" updated the paper inputs' `disabled` in that same
	 * effect and slammed the panel shut. SectionHeader owns a plain boolean instead.
	 */
	let panelOpen = $state(untrack(() => open));

	const dots: { id: DotStyle; label: string }[] = [
		{ id: 'square', label: 'Square' },
		{ id: 'rounded', label: 'Rounded' },
		{ id: 'dots', label: 'Dots' },
		{ id: 'classy', label: 'Leaf' },
		{ id: 'extra-rounded', label: 'Soft' }
	];
	/**
	 * One vocabulary across both corner rows. The old labels had "Round" sitting beside "Rounded"
	 * in two adjacent controls, which was a guessing game.
	 */
	const cornerSquares: { id: CornerSquareStyle; label: string }[] = [
		{ id: 'square', label: 'Square' },
		{ id: 'extra-rounded', label: 'Rounded' },
		{ id: 'dot', label: 'Circle' },
		{ id: 'classy', label: 'Leaf' }
	];
	const cornerDots: { id: CornerDotStyle; label: string }[] = [
		{ id: 'square', label: 'Square' },
		{ id: 'dot', label: 'Circle' },
		{ id: 'classy', label: 'Leaf' }
	];
	const fills = [
		{ id: 'none', label: 'Solid' },
		{ id: 'linear', label: 'Linear' },
		{ id: 'radial', label: 'Radial' }
	] as const;
	/**
	 * The look tiles, typed to admit the design's 'custom' state: a hand-made combination selects
	 * no tile, which is the honest answer rather than a stale one.
	 */
	const looks: readonly { id: LookId | 'custom'; label: string }[] = LOOKS;
	const ctas = ['Scan me', 'Scan to RSVP', 'Scan for menu', 'Scan to join WiFi', 'Scan to save contact', 'Scan for details'];

	/**
	 * The weaker of the code and corner contrasts, against the background or, when that is
	 * transparent, against white paper, which is what the sizing rules assume it prints on.
	 * The corners are what a scanner finds first.
	 */
	const contrast = $derived(contrastRatio(design.weakestFg, paperColor(design.bgColor)));
	/** The contrast badge: a verdict in Basic, the ratio and the verdict in Advanced, naming the paper when the background is transparent. */
	const contrastLabel = $derived.by(() => {
		// Not "clear": beside a Colours heading that reads as a colour.
		const verdict = contrast >= 4 ? 'good' : 'low';
		if (!advanced) return `${verdict === 'good' ? 'Good' : 'Low'} contrast`;
		return `${contrast.toFixed(1)}:1 ${verdict}${design.transparentBg ? ' on white' : ''}`;
	});
	/** The whole panel is inert while a halftone picture owns the render. */
	const off = $derived(design.halftoneActive);

	/** The other colours in this design, offered in every picker's swatch row. */
	const related = $derived(
		[design.fg, design.cornerColor, design.bg, design.gradientTo, design.frameColor, design.frameTextColor].filter(
			(c): c is string => typeof c === 'string' && c.startsWith('#')
		)
	);

	/**
	 * What the panel says about itself when it is folded away, so nothing is hidden by folding.
	 * It keeps reporting the style settings while a photo is in force, because they come back the
	 * moment the photo is removed.
	 */
	const summary = $derived.by(() => {
		const parts: string[] = [];
		if (off) parts.push('Off: photo');
		const look = LOOKS.find((l) => l.id === design.look);
		if (look) {
			if (look.id !== 'classic') parts.push(look.label);
		} else {
			const dot = dots.find((d) => d.id === design.dot);
			if (dot && design.dot !== 'square') parts.push(dot.label);
			if (design.cornerSquare !== 'square' || design.cornerDot !== 'square') parts.push('Corners');
		}
		if (design.gradient !== 'none') parts.push('Gradient');
		if (design.fg !== '#000000' || design.cornerColor !== null || (design.bg !== '#ffffff' && !design.transparentBg)) parts.push('Colour');
		if (design.transparentBg) parts.push('Transparent');
		if (design.frameEnabled) parts.push('Frame');
		return parts.join(' · ');
	});

</script>

<SectionHeader
	title="Style"
	collapsible
	bind:open={panelOpen}
	{summary}
	controls="style-body"
	onopen={preloadStyled}
/>

{#if panelOpen}
	<div id="style-body" class="mt-4 grid gap-5">
		{#if off}
			<p class="notice notice-info">
				Code and Background still apply: they colour the picture's dots and its paper. The shapes, corner colour, fill,
				and frame are the ones Artistic QR replaces; they come back when you remove the picture or untick "Blend the
				picture into the code".
			</p>
		{/if}

		<!-- Code and Background are the only two settings that mean the same thing whichever renderer
		     is in charge, so they sit outside the fieldset a photo disables. They used to be inside
		     it, which left them governing the Artistic QR output while greyed out and unreachable: a
		     code coloured as one end of a gradient could not be taken back without removing the
		     picture first. Everything below the fieldset really is dropped by the halftone renderer. -->
		<div class="grid gap-3">
				<p class="subhead">
					Colours
					<span class="subhead-end">
						<span
							class="badge {contrast >= 4 ? 'badge-ok' : 'badge-warn'}"
							title="Contrast ratio, WCAG formula. Scanners read with red light, so keep it high."
						>
							{contrastLabel}
						</span>
					</span>
				</p>
				<!-- Side by side except in the lg band, where the column is ~306 px and a "#000000"
				     field loses its last character. -->
				<div class="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
					<ColourField label="Code" bind:value={design.fg} {related} />
					<!-- Transparent is not available to a photo, so it does not lock the field there. -->
					<ColourField label="Background" bind:value={design.bg} disabled={design.transparentBg && !off} {related} />
					<!-- The corners follow the code colour until one is chosen; the link puts them back. -->
					<ColourField label="Corners" bind:value={design.cornerFg} disabled={off} {related}>
						{#snippet end()}
							{#if design.cornerColor !== null}
								<button type="button" class="text-xs text-ink-3 underline hover:text-ink" onclick={() => (design.cornerColor = null)}>Match code</button>
							{:else}
								<span class="text-xs text-ink-3">Same as code</span>
							{/if}
						{/snippet}
					</ColourField>
				</div>
			</div>

		<fieldset
			disabled={off}
			aria-disabled={off}
			class="m-0 grid min-w-0 gap-5 border-0 p-0 transition-opacity {off ? 'opacity-40 select-none' : ''}"
		>
			<div class="grid gap-3">
				{#if advanced}
					<label class="toggle">
						<input type="checkbox" role="switch" bind:checked={design.transparentBg} />
						Transparent background
					</label>

					<div class="field gap-2">
						<span class="label">Fill</span>
						<div class="seg justify-self-start" role="group" aria-label="Fill">
							{#each fills as f (f.id)}
								<button type="button" aria-pressed={design.gradient === f.id} onclick={() => (design.gradient = f.id)}>{f.label}</button>
							{/each}
						</div>
						{#if design.gradient !== 'none'}
							<div class="flex flex-wrap items-end gap-3">
								<ColourField label="Fades to" bind:value={design.gradientTo} {related} />
								{#if design.gradient === 'linear'}
									<div class="min-w-[9rem] flex-1">
										<Slider
											label="Angle"
											bind:value={design.gradientAngleDeg}
											min={0}
											max={360}
											step={15}
											reset={45}
											format={(v) => `${v}°`}
										/>
									</div>
								{/if}
							</div>
							<p class="hint">Gradients print as RGB. Keep both ends dark so every module keeps contrast with the background.</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Shape -->
			<div class="grid gap-3">
				<p class="subhead">Shape</p>
				<!-- One preset tile sets all three shapes; Advanced can then adjust each below, and a
				     hand-made combination leaves no tile selected. (Code and docs call a preset a "look".) -->
				<Swatches label="Preset" options={looks} bind:value={design.look} columns={5} ariaLabel="Preset">
					{#snippet draw(id)}{#if id !== 'custom'}<QrArt kind="look" style={id} />{/if}{/snippet}
				</Swatches>
				{#if advanced}
					<Swatches label="Modules" options={dots} bind:value={design.dot} columns={5} ariaLabel="Module shape">
						{#snippet draw(id)}<QrArt kind="modules" style={id} />{/snippet}
					</Swatches>
					<Swatches label="Corner frames" options={cornerSquares} bind:value={design.cornerSquare} columns={4} ariaLabel="Corner frame shape">
						{#snippet draw(id)}<QrArt kind="frame" style={id} />{/snippet}
					</Swatches>
					<Swatches label="Corner dots" options={cornerDots} bind:value={design.cornerDot} columns={4} ariaLabel="Corner dot shape">
						{#snippet draw(id)}<QrArt kind="dot" style={id} />{/snippet}
					</Swatches>
				{/if}
			</div>

			<!-- Frame -->
			<div class="grid gap-3">
				<p class="subhead">Frame</p>
				<label class="toggle">
					<input type="checkbox" role="switch" bind:checked={design.frameEnabled} />
					Call to action under the code
				</label>
				{#if design.frameEnabled}
					<div class="grid gap-3">
						<input class="input" type="text" aria-label="Frame text" bind:value={design.frameText} maxlength={FRAME.maxChars} list="cta-list" />
						<datalist id="cta-list">{#each ctas as c (c)}<option value={c}></option>{/each}</datalist>
						<div class="flex flex-wrap gap-1.5">
							{#each ctas as c (c)}
								<button type="button" class="chip" data-on={design.frameText === c} onclick={() => (design.frameText = c)}>{c}</button>
							{/each}
						</div>
						<div class="flex flex-wrap items-end gap-3">
							<ColourField label="Frame" bind:value={design.frameColor} {related} />
							<ColourField label="Text" bind:value={design.frameTextColor} {related} />
						</div>
						<p class="hint">Specific wording ("Scan for the menu") gets more scans than "Scan me". The frame sits outside the code, so the print width stays the width of the code itself.</p>
					</div>
				{/if}
			</div>
		</fieldset>
	</div>
{/if}
