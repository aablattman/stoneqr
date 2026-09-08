<script lang="ts">
	import { untrack } from 'svelte';
	import {
		IMAGE_ZOOM_MAX,
		IMAGE_ZOOM_MIN,
		IMAGE_OFFSET_MAX,
		THRESHOLD_DEFAULT,
		THRESHOLD_MAX,
		THRESHOLD_MIN
	} from '@stoneqr/engine';
	import { GLYPHS, glyphDataUrl, glyphName, glyphSvg, type Glyph } from '$lib/glyphs';
	import ColourField from '$lib/components/ColourField.svelte';
	import CropBox from '$lib/components/CropBox.svelte';
	import DropTile from '$lib/components/DropTile.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import Slider from '$lib/components/Slider.svelte';
	import Swatches from '$lib/components/Swatches.svelte';
	import ToneArt from '$lib/components/ToneArt.svelte';
	import type { Design, HalftoneTone } from './state.svelte';
	import { pictureFileProblem } from './pictures';
	import { shapeContrast, SHAPE_CONTRAST_MIN } from './contrast';

	const TONES: { id: HalftoneTone; label: string }[] = [
		{ id: 'colour', label: 'Colour' },
		{ id: 'grey', label: 'Black and white' },
		{ id: 'silhouette', label: 'Silhouette' }
	];

	let { design, open = false, advanced = false }: { design: Design; open?: boolean; advanced?: boolean } = $props();

	/**
	 * The panel's own open state, for the reason spelled out in SectionHeader: an attribute bound
	 * straight to the prop is reasserted by the block's shared attribute effect, which both closed
	 * the panel mid-edit and, once a picture was in, made it impossible to fold away. The prop can
	 * still open the panel — /photo, or a picture arriving — but never closes it.
	 */
	let panelOpen = $state(untrack(() => open));
	$effect(() => {
		if (open) panelOpen = true;
	});

	/** What the panel says about itself when folded, so nothing is hidden by folding. */
	const summary = $derived.by(() => {
		if (!design.halftoneImage) return '';
		const tone = TONES.find((t) => t.id === design.halftoneTone)?.label ?? '';
		// A shape colour is invisible once the panel is folded, so the summary says it is set.
		const shape = design.halftone && design.halftoneSilhouette && design.shapeColor !== '#000000' ? 'Shape colour' : '';
		return [design.halftoneImageName, design.halftone ? tone : 'off', shape].filter(Boolean).join(' · ');
	});

	/** The other colours in this design, offered in the picker's swatch row, as the Style panel does. */
	const related = $derived(
		[design.fg, design.bg, design.cornerColor].filter((c): c is string => typeof c === 'string' && c.startsWith('#'))
	);

	/**
	 * Whether the shape will stand out from the paper. Appearance, not scanning: the dots are
	 * painted over the picture at full strength, so the shape colour cannot put a scan at risk
	 * (measured; see `SHAPE_CONTRAST_MIN`), and the decode check is the gate either way.
	 */
	const shapeWarning = $derived(
		design.halftoneSilhouette && shapeContrast(design.shapeColor, design.bgColor) < SHAPE_CONTRAST_MIN
			? 'The shape is close to the background colour, so it will barely show. Move one of the two further from the other.'
			: ''
	);

	let imageError = $state('');
	const cropChanged = $derived(design.halftoneZoom !== 1 || design.halftoneOffsetX !== 0 || design.halftoneOffsetY !== 0);

	async function onImage(file: File) {
		imageError = '';
		// The same rules a design file is held to; see `pictures.ts`.
		const problem = pictureFileProblem('halftone', file);
		if (problem) {
			imageError = problem;
			return;
		}
		try {
			design.halftoneImage = await new Promise<string>((res, rej) => {
				const r = new FileReader();
				r.onload = () => res(String(r.result));
				r.onerror = () => rej(new Error('Could not read the file'));
				r.readAsDataURL(file);
			});
			design.halftoneImageName = file.name;
			design.halftone = true;
			resetCrop();
		} catch (err) {
			imageError = err instanceof Error ? err.message : String(err);
		}
	}

	/** A built-in shape is a silhouette by definition, so picking one switches the tone as well. */
	function useGlyph(g: Glyph) {
		imageError = '';
		design.halftoneImage = glyphDataUrl(g);
		design.halftoneImageName = glyphName(g);
		design.halftone = true;
		design.halftoneTone = 'silhouette';
		resetCrop();
	}

	function resetCrop() {
		design.halftoneZoom = 1;
		design.halftoneOffsetX = 0;
		design.halftoneOffsetY = 0;
	}

	function clearImage() {
		design.halftoneImage = undefined;
		design.halftoneImageName = '';
		design.halftone = false;
		design.halftoneRaster = null;
		design.halftoneOpts = null;
		design.halftoneNote = '';
		imageError = '';
		resetCrop();
	}

	const pct = (v: number) => `${Math.round(v * 100)}%`;
</script>

<SectionHeader title="Photo QR" collapsible bind:open={panelOpen} {summary} controls="photo-body" />

{#if panelOpen}
	<div id="photo-body" class="mt-4 grid gap-5">
		<div class="grid gap-3">
			<p class="subhead">Picture</p>
			<DropTile
				src={design.halftoneImage ?? ''}
				name={design.halftoneImageName}
				label="Drop a picture here, or choose a file"
				hint="Blend a photo or a logo into the code itself. It stays in your browser."
				error={imageError}
				ariaLabel="Upload a photo to blend into the code"
				onfile={onImage}
				onclear={clearImage}
			/>
			{#if design.halftoneImage}
				<label class="toggle">
					<input type="checkbox" role="switch" bind:checked={design.halftone} />
					Blend the picture into the code
				</label>
			{:else}
				<!--
				  An action, not a choice: each shape loads itself as the picture. They wear the same
				  tile as the style swatches, without captions, because seven captions will not fit a
				  22 rem column and the shapes say what they are.
				-->
				<div class="field">
					<span class="label">Or start from a shape</span>
					<div class="grid grid-cols-7 gap-1.5">
						{#each GLYPHS as g (g.id)}
							<button
								type="button"
								class="swatch"
								title={g.label}
								aria-label={`Use the ${g.label} shape`}
								onclick={() => useGlyph(g)}
							>
								<span class="swatch-art">{@html glyphSvg(g, 40)}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if design.halftoneActive}
			<div class="grid gap-3">
				<p class="subhead">Crop</p>
				<!-- The box is the data area on the picture; dragging it is the Across and Down sliders,
				     and its corner is the Zoom slider. The sliders stay for precision, the two offsets
				     in Advanced only, since the box says the same thing in a picture. -->
				<CropBox
					src={design.halftoneImage ?? ''}
					bind:zoom={design.halftoneZoom}
					bind:offsetX={design.halftoneOffsetX}
					bind:offsetY={design.halftoneOffsetY}
				/>
				<Slider label="Zoom" bind:value={design.halftoneZoom} min={IMAGE_ZOOM_MIN} max={IMAGE_ZOOM_MAX} step={0.05} reset={1} format={(v) => `${v.toFixed(2)}×`} />
				{#if advanced}
					<Slider label="Across" bind:value={design.halftoneOffsetX} min={-IMAGE_OFFSET_MAX} max={IMAGE_OFFSET_MAX} step={0.01} reset={0} format={pct} />
					<Slider label="Down" bind:value={design.halftoneOffsetY} min={-IMAGE_OFFSET_MAX} max={IMAGE_OFFSET_MAX} step={0.01} reset={0} format={pct} />
				{/if}
				<p class="hint">
					Drag the box to choose what shows in the code, and drag its corner to zoom. At 1× the picture fills the
					code; zoom out to leave paper around it.
					{#if cropChanged}<button type="button" class="underline" onclick={resetCrop}>Reset crop</button>{/if}
				</p>
			</div>

			<div class="grid gap-3">
				<p class="subhead">Look</p>
				<Swatches label="Show as" options={TONES} bind:value={design.halftoneTone} columns={3} ariaLabel="Picture tone">
					{#snippet draw(id)}<ToneArt tone={id} />{/snippet}
				</Swatches>

				{#if design.halftoneSilhouette}
					<Slider
						label="Cut"
						bind:value={design.halftoneThreshold}
						min={THRESHOLD_MIN}
						max={THRESHOLD_MAX}
						step={0.01}
						reset={THRESHOLD_DEFAULT}
						startLabel="Paper"
						endLabel="Ink"
						format={advanced ? pct : () => ''}
					/>
					<!-- Under the Cut and only while the tone is Silhouette, because there is no shape to
					     colour otherwise. A plain fill colour of its own: it must not follow the code
					     colour, or a code coloured as one end of a gradient hands that colour to the
					     shape while the Style panel is disabled and cannot take it back. -->
					<ColourField label="Shape" bind:value={design.shapeColor} {related} />
					{#if shapeWarning}
						<p class="notice notice-info">{shapeWarning}</p>
					{/if}
					<p class="hint">
						A silhouette turns the picture into solid blocks of ink and paper: right for a logo or a shape, wrong for a
						photo. Drag toward Ink if parts of the shape are missing, toward Paper if the background fills in.
					</p>
				{/if}

				{#if advanced}
					<Slider label="Dot size" bind:value={design.halftoneDotScale} min={0.25} max={0.7} step={0.05} reset={0.4} format={pct} />
					<Slider label="Fade" bind:value={design.halftoneDim} min={0} max={0.6} step={0.05} reset={0} format={pct} />
					<Slider label="Contrast" bind:value={design.halftoneContrast} min={0.6} max={1.6} step={0.05} reset={1} format={(v) => `${v.toFixed(2)}×`} />
				{/if}
			</div>

			{#if design.halftoneNote}
				<p class="notice notice-warn">{design.halftoneNote}</p>
			{/if}
			{#if design.halftoneOverridesStyle}
				<p class="notice notice-info">
					The photo replaces most Style settings. Module and corner shapes, the corner colour, gradients, the logo, and the frame
					are ignored while a photo is blended in; Code and Background still apply, and colour the dots and the paper.
					Turn the photo off to use the rest.
				</p>
			{/if}
		{/if}

		<p class="hint">
			{#if advanced}
				Error correction is forced to H and the code is enlarged to at least version 7 so the picture shows through.
			{:else}
				The code is made larger and sturdier so the picture shows through.
			{/if}
			Picture codes download as PNG or SVG.
			{#if !advanced}Advanced adds dot size, fade, and contrast for a photo that is hard to read in print.{/if}
		</p>
	</div>
{/if}
