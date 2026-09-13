<script lang="ts">
	/**
	 * The in-page colour picker (docs/ui-refresh.md §3a).
	 *
	 * It is a modal <dialog> opened with showModal(), for one reason above all others: the browser
	 * puts a modal dialog in the top layer and makes the rest of the page inert, so a pointer
	 * press outside the card lands on the dialog's own backdrop and never reaches the page. That
	 * is the behaviour we want — clicking away closes the picker and does nothing else, rather
	 * than also pressing whatever button happened to be underneath. The Popover API's light
	 * dismiss and a document-level click listener both let that press through, so neither is used
	 * here. The backdrop is transparent, so the page looks untouched while the card is open.
	 *
	 * The card is anchored under its swatch rather than centred, so it reads as belonging to the
	 * control it edits. It closes on scroll and resize instead of following the anchor around.
	 */
	import { tick } from 'svelte';
	import { describeSv, hexToHsv, hsvToHex, isLight, normaliseHex, type Hsv } from '$lib/colour';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		value,
		anchor,
		title = 'Colour',
		/** Extra colours to offer, e.g. the other colours already used in this design. */
		related = [],
		onchange
	}: {
		open?: boolean;
		value: string;
		anchor?: HTMLElement;
		title?: string;
		related?: string[];
		onchange: (hex: string) => void;
	} = $props();

	/** Site tokens, always offered. Ink, paper, and the accent are what most designs need. */
	const SITE_SWATCHES = ['#1b1917', '#ffffff', '#f4f0e8', '#1f6f63', '#a8551b', '#a3301d'];
	const swatches = $derived([...new Set([...SITE_SWATCHES, ...related.map((c) => normaliseHex(c) ?? c)])]);

	let dialog = $state<HTMLDialogElement>();
	let square = $state<HTMLElement>();

	/**
	 * Hue, saturation and value are held here while the card is open rather than derived from the
	 * hex on every render. Black and white have no hue of their own, so a round trip through the
	 * hex would throw away the hue the user picked the moment they dragged to a corner.
	 */
	let hsv = $state<Hsv>({ h: 0, s: 0, v: 0 });
	let hexText = $state('');
	let hexBad = $state(false);
	let pos = $state({ left: 0, top: 0 });

	const hasDropper = $derived(typeof window !== 'undefined' && 'EyeDropper' in window);

	function place() {
		if (!anchor) return;
		const r = anchor.getBoundingClientRect();
		const W = 236;
		const H = 268;
		const gap = 6;
		const margin = 8;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		// Below the swatch when it fits, above when it does not.
		const below = r.bottom + gap;
		const wanted = below + H + margin <= vh ? below : r.top - gap - H;
		// Then clamped into the viewport on both axes, so a card can never render off screen —
		// including when its swatch has been scrolled out of view and opened from the keyboard.
		const clamp = (n: number, hi: number) => Math.max(margin, Math.min(n, Math.max(margin, hi)));
		pos = {
			left: vw < 480 ? Math.max(margin, (vw - W) / 2) : clamp(r.left, vw - W - margin),
			top: clamp(wanted, vh - H - margin)
		};
	}

	$effect(() => {
		const d = dialog;
		if (!d) return;
		if (open) {
			if (!d.open) {
				hsv = hexToHsv(value);
				hexText = normaliseHex(value) ?? value;
				hexBad = false;
				place();
				d.showModal();
				tick().then(() => square?.focus());
			}
		} else if (d.open) {
			d.close();
		}
	});

	/** Scrolling or resizing would leave the card floating away from its swatch, so it closes. */
	$effect(() => {
		if (!open) return;
		const shut = () => (open = false);
		window.addEventListener('scroll', shut, { capture: true, passive: true });
		window.addEventListener('resize', shut);
		return () => {
			window.removeEventListener('scroll', shut, { capture: true });
			window.removeEventListener('resize', shut);
		};
	});

	function commit(next: Hsv) {
		hsv = next;
		const hex = hsvToHex(next);
		hexText = hex;
		hexBad = false;
		onchange(hex);
	}

	function setHex(raw: string) {
		hexText = raw;
		const norm = normaliseHex(raw);
		if (!norm) {
			hexBad = true;
			return;
		}
		hexBad = false;
		hsv = hexToHsv(norm);
		onchange(norm);
	}

	function pickSwatch(hex: string) {
		hsv = hexToHsv(hex);
		hexText = hex;
		hexBad = false;
		onchange(hex);
	}

	/** Saturation across, brightness up, from a pointer position inside the square. */
	function fromPointer(e: PointerEvent) {
		if (!square) return;
		const r = square.getBoundingClientRect();
		const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
		const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
		commit({ ...hsv, s, v });
	}

	function squareDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		fromPointer(e);
	}

	function squareMove(e: PointerEvent) {
		if (e.buttons !== 1) return;
		fromPointer(e);
	}

	function squareKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 0.1 : 0.01;
		let { s, v } = hsv;
		if (e.key === 'ArrowLeft') s -= step;
		else if (e.key === 'ArrowRight') s += step;
		else if (e.key === 'ArrowUp') v += step;
		else if (e.key === 'ArrowDown') v -= step;
		else return;
		e.preventDefault();
		commit({ ...hsv, s: Math.min(1, Math.max(0, s)), v: Math.min(1, Math.max(0, v)) });
	}

	async function eyedropper() {
		try {
			// Chrome and Edge only; the button is hidden elsewhere.
			const result = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
			const norm = normaliseHex(result.sRGBHex);
			if (norm) pickSwatch(norm);
		} catch {
			/* the user pressed Escape out of the eyedropper; nothing to do */
		}
	}

	const current = $derived(hsvToHex(hsv));
</script>

<dialog
	bind:this={dialog}
	class="picker"
	style="left: {pos.left}px; top: {pos.top}px"
	aria-label="{title} picker"
	onclose={() => {
		open = false;
		anchor?.focus();
	}}
	oncancel={() => (open = false)}
	onpointerdown={(e) => {
		// The backdrop reports the dialog itself as the target. A press on the card hits a child.
		if (e.target === e.currentTarget) open = false;
	}}
>
	<div class="grid gap-2.5 p-2.5">
		<div
			bind:this={square}
			class="picker-square"
			style="--hue: {hsv.h}"
			role="slider"
			tabindex="0"
			aria-label="Saturation and brightness"
			aria-valuetext={describeSv(hsv.s, hsv.v)}
			aria-valuenow={Math.round(hsv.v * 100)}
			aria-valuemin="0"
			aria-valuemax="100"
			onpointerdown={squareDown}
			onpointermove={squareMove}
			onkeydown={squareKey}
		>
			<span
				class="picker-handle"
				style="left: {hsv.s * 100}%; top: {(1 - hsv.v) * 100}%; background: {current}"
			></span>
		</div>

		<input
			class="range range-hue"
			type="range"
			min="0"
			max="360"
			step="1"
			aria-label="Hue"
			value={Math.round(hsv.h)}
			oninput={(e) => commit({ ...hsv, h: Number(e.currentTarget.value) })}
		/>

		<div class="flex items-center gap-2">
			<span class="picker-preview" style="background: {current}"></span>
			<input
				class="input num flex-1 px-2 py-1 text-sm"
				aria-label="{title} hex value"
				aria-invalid={hexBad}
				spellcheck="false"
				autocapitalize="off"
				maxlength="7"
				value={hexText}
				oninput={(e) => setHex(e.currentTarget.value)}
				onblur={() => {
					const norm = normaliseHex(hexText);
					hexText = norm ?? current;
					hexBad = false;
				}}
			/>
			{#if hasDropper}
				<button type="button" class="picker-tool" title="Pick a colour from the screen" aria-label="Pick a colour from the screen" onclick={eyedropper}>
					<Icon name="dropper" size={15} />
				</button>
			{/if}
		</div>

		<div class="flex flex-wrap gap-1" role="group" aria-label="Suggested colours">
			{#each swatches as s (s)}
				<button
					type="button"
					class="picker-chip"
					style="background: {s}"
					title={s}
					aria-label={s}
					aria-pressed={current === s}
					onclick={() => pickSwatch(s)}
				>
					{#if current === s}
						<Icon name="tick" size={11} width={2} class={isLight(s) ? 'text-stone-ink' : 'text-white'} />
					{/if}
				</button>
			{/each}
		</div>
	</div>
</dialog>
