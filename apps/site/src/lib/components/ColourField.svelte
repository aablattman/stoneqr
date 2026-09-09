<script lang="ts">
	/**
	 * A colour control: a swatch button and a mono hex field. The swatch opens our own picker
	 * (ColourPopover) rather than the browser's, which on macOS is the full system Colors panel —
	 * a separate window that floats away from the control and stays open while you click
	 * elsewhere. There is no <input type=color> anywhere on the site.
	 */
	import { untrack, type Snippet } from 'svelte';
	import { normaliseHex } from '$lib/colour';
	import ColourPopover from './ColourPopover.svelte';

	let {
		label,
		value = $bindable(),
		disabled = false,
		/** Other colours in the current design, offered in the picker's swatch row. */
		related = [],
		/** Compact form: swatch only, no hex field, for the frame's two colours. */
		compact = false,
		/** A small note or action at the end of the label row, such as "Same as code". */
		end
	}: {
		label: string;
		value: string;
		disabled?: boolean;
		related?: string[];
		compact?: boolean;
		end?: Snippet;
	} = $props();

	let swatch = $state<HTMLButtonElement>();
	let open = $state(false);
	/** The hex field is free text while it is being typed; only a valid value reaches the design. */
	let text = $state(value);
	/** True while the text is not a colour, so the field can say so without touching the design. */
	const bad = $derived(normaliseHex(text) === null);

	// Keep the field in step when the colour changes from the picker, a swatch, or a reset. Only
	// `value` is tracked here: reading `text` as a dependency made the effect re-run on every
	// keystroke and snap a half-typed "#a3" straight back to the current colour, so the box could
	// take a pasted code but never a typed one.
	$effect(() => {
		const norm = normaliseHex(value);
		untrack(() => {
			if (norm && normaliseHex(text) !== norm) text = norm;
		});
	});

	/** Enter commits (via blur, which normalises); Escape puts the current colour back. */
	function key(e: KeyboardEvent) {
		if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
		else if (e.key === 'Escape') {
			text = normaliseHex(value) ?? value;
			e.stopPropagation();
		}
	}
</script>

<div class="field">
	{#if end}
		<span class="label flex items-baseline justify-between gap-2">{label}<span class="font-sans tracking-normal normal-case">{@render end()}</span></span>
	{:else}
		<span class="label">{label}</span>
	{/if}
	<div class="flex items-center gap-2">
		<button
			bind:this={swatch}
			type="button"
			class="swatch-well"
			style="--well: {value}"
			{disabled}
			aria-haspopup="dialog"
			aria-expanded={open}
			aria-label="{label} colour, currently {value}. Opens a colour picker."
			onclick={() => (open = !open)}
		></button>
		{#if !compact}
			<input
				class="input num px-2 py-1.5 text-sm"
				type="text"
				aria-label="{label} hex"
				aria-invalid={bad}
				maxlength="7"
				spellcheck="false"
				autocapitalize="off"
				autocomplete="off"
				{disabled}
				value={text}
				onfocus={(e) => e.currentTarget.select()}
				oninput={(e) => {
					text = e.currentTarget.value;
					const norm = normaliseHex(text);
					if (norm) value = norm;
				}}
				onkeydown={key}
				onblur={() => (text = normaliseHex(text) ?? value)}
			/>
		{/if}
	</div>
</div>

<ColourPopover bind:open {value} anchor={swatch} title={label} {related} onchange={(hex) => (value = hex)} />
