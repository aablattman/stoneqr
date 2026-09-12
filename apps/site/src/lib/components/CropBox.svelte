<script lang="ts">
	/**
	 * The picture with a box drawn over it. Drag the box to choose what shows in the code; drag
	 * its corner to zoom or reshape it. The box is whatever the `model` says it is: for Artistic
	 * QR the engine's placement run backwards (`lib/crop.ts`), for the logo the free crop in
	 * `lib/logo-crop.ts`. The component keeps no state of its own; every gesture is a call on the
	 * model, which writes the design's fields, and the box is read back from them.
	 *
	 * The stage is a square with the picture contain-fitted at 72% of it, so a zoomed-out box
	 * (paper around the picture) still has room to show. Keyboard: the arrow keys move the box,
	 * plus and minus zoom; the sliders beside it stay the precise route.
	 */
	import type { CropModel } from '$lib/crop';

	let {
		src,
		model,
		/** True while the crop is not in force (a disabled fieldset does not stop pointer or keyboard gestures on its own). */
		disabled = false,
		label = 'Crop. Drag the box to choose what shows in the code, or use the arrow keys; drag its corner or press plus and minus to zoom.'
	}: { src: string; model: CropModel; disabled?: boolean; label?: string } = $props();

	const FIT = 0.72;
	let iw = $state(0);
	let ih = $state(0);
	let stage = $state<HTMLDivElement>();
	let probe = $state<HTMLImageElement>();

	/** The picture's rectangle inside the stage, as fractions of the stage. */
	const pic = $derived.by(() => {
		if (!iw || !ih) return null;
		const aspect = iw / ih;
		const w = aspect >= 1 ? FIT : FIT * aspect;
		const h = aspect >= 1 ? FIT / aspect : FIT;
		return { x: (1 - w) / 2, y: (1 - h) / 2, w, h, aspect };
	});
	/** The box's rectangle inside the stage, as fractions of the stage. */
	const box = $derived.by(() => {
		if (!pic) return null;
		const r = model.rect(pic.aspect);
		return { left: pic.x + r.u * pic.w, top: pic.y + r.v * pic.h, width: r.w * pic.w, height: r.h * pic.h, r };
	});

	type Drag = { mode: 'move' | 'zoom'; x0: number; y0: number; u0: number; v0: number; w0: number; h0: number };
	/** Reactive because the box's dragging state is read in the template. */
	let drag = $state<Drag | null>(null);

	function start(e: PointerEvent, mode: Drag['mode']) {
		if (!box || e.button !== 0 || disabled) return;
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { mode, x0: e.clientX, y0: e.clientY, u0: box.r.u, v0: box.r.v, w0: box.r.w, h0: box.r.h };
	}
	function move(e: PointerEvent) {
		if (!drag || !pic || !stage) return;
		const s = stage.getBoundingClientRect();
		// Pointer travel in picture coordinates: stage pixels, then stage fraction, then picture fraction.
		const du = (e.clientX - drag.x0) / s.width / pic.w;
		const dv = (e.clientY - drag.y0) / s.height / pic.h;
		if (drag.mode === 'move') {
			model.moveTo(pic.aspect, drag.u0 + du, drag.v0 + dv);
		} else {
			// The corner follows whichever axis the pointer moved more along, relative to the box.
			// The top-left corner is the one from the start of the drag, so only the corner being
			// dragged moves.
			const byWidth = Math.abs(du / drag.w0) >= Math.abs(dv / drag.h0);
			model.resizeTo(pic.aspect, drag.u0, drag.v0, drag.w0 + du, drag.h0 + dv, byWidth ? 'w' : 'h', e.shiftKey);
		}
	}
	function end() {
		drag = null;
	}

	function key(e: KeyboardEvent) {
		if (!pic || !box || disabled) return;
		const step = e.shiftKey ? 0.1 : 0.02;
		let du = 0;
		let dv = 0;
		switch (e.key) {
			case 'ArrowLeft':
				du = -step;
				break;
			case 'ArrowRight':
				du = step;
				break;
			case 'ArrowUp':
				dv = -step;
				break;
			case 'ArrowDown':
				dv = step;
				break;
			case '+':
			case '=':
				model.zoomStep(pic.aspect, 1);
				break;
			case '-':
			case '_':
				model.zoomStep(pic.aspect, -1);
				break;
			default:
				return;
		}
		e.preventDefault();
		if (du || dv) model.moveTo(pic.aspect, box.r.u + du, box.r.v + dv);
	}

	const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
</script>

<!--
  The stage takes focus and the arrow keys because it is the thing being adjusted; the linter
  cannot know that the sliders beside it are the assistive route and that this is the pointer
  and keyboard convenience on top. The box and its handle are pointer surfaces only, hidden from
  the accessibility tree, so they carry no role of their own.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div bind:this={stage} class="crop-stage" role="group" aria-label={label} aria-disabled={disabled} tabindex={disabled ? -1 : 0} onkeydown={key}>
	{#if pic}
		<img
			{src}
			alt=""
			draggable="false"
			style="left: {pct(pic.x)}; top: {pct(pic.y)}; width: {pct(pic.w)}; height: {pct(pic.h)}"
		/>
	{/if}
	{#if box}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="crop-box"
			aria-hidden="true"
			data-dragging={drag !== null}
			style="left: {pct(box.left)}; top: {pct(box.top)}; width: {pct(box.width)}; height: {pct(box.height)}"
			onpointerdown={(e) => start(e, 'move')}
			onpointermove={move}
			onpointerup={end}
			onpointercancel={end}
		>
			<span
				class="crop-handle"
				aria-hidden="true"
				onpointerdown={(e) => start(e, 'zoom')}
				onpointermove={move}
				onpointerup={end}
				onpointercancel={end}
			></span>
		</div>
	{/if}
	<!-- Loaded once, off screen, for the natural size; the visible picture is positioned from it. -->
	<img
		bind:this={probe}
		{src}
		alt=""
		class="sr-only"
		onload={() => {
			iw = probe?.naturalWidth ?? 0;
			ih = probe?.naturalHeight ?? 0;
		}}
	/>
</div>
