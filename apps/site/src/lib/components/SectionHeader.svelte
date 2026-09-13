<script lang="ts">
	/**
	 * The heading at the top of every panel, in two forms.
	 *
	 * Static (`collapsible` false): a heading with an optional badge on the right. Used by
	 * Content, Size and download, and the bulk page's cards.
	 *
	 * Collapsible: the heading holds a disclosure button that folds the panel. When folded it
	 * shows a one-line summary of what is set inside, so nothing is hidden by folding — a closed
	 * Style panel still says "Rounded · Gradient · Frame".
	 *
	 * Why a button inside a heading rather than <details>/<summary>: the panels used to be
	 * <details>, and Svelte merges every dynamic attribute in a block into one effect, so
	 * `details.open = open` was reasserted whenever any sibling attribute's dependency changed —
	 * ticking "Transparent background" updated the paper inputs' `disabled` in the same effect
	 * and slammed the panel shut. Owning the boolean here removes that class of bug entirely,
	 * and the heading stays a heading for anyone navigating by landmark.
	 */
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		title,
		id,
		level = 2,
		collapsible = false,
		open = $bindable(true),
		summary = '',
		controls,
		badge,
		onopen
	}: {
		title: string;
		id?: string;
		level?: 2 | 3;
		collapsible?: boolean;
		open?: boolean;
		/** Shown while collapsed: what is set inside, in a few words. */
		summary?: string;
		/** id of the region this header folds, for aria-controls. */
		controls?: string;
		badge?: Snippet;
		/** Called when the panel opens, for preloading a lazy chunk. */
		onopen?: () => void;
	} = $props();

	function toggle() {
		open = !open;
		if (open) onopen?.();
	}
</script>

{#snippet inner()}
	{#if collapsible}
		<button
			type="button"
			class="group -mx-1 flex w-full cursor-pointer items-center gap-3 rounded px-1 py-1 text-left"
			aria-expanded={open}
			aria-controls={controls}
			onclick={toggle}
		>
			<span class="min-w-0 flex-1 truncate">{title}</span>
			{#if !open && summary}
				<span class="ticket min-w-0 max-w-[55%] shrink truncate font-normal">{summary}</span>
			{/if}
			{#if badge}{@render badge()}{/if}
			<Icon
				name="chevron"
				size={18}
				class="text-ink-3 transition-transform duration-150 group-hover:text-ink {open ? 'rotate-180' : ''}"
			/>
		</button>
	{:else}
		<!--
		  Wraps rather than truncates: in a narrow column "Size and download" beside a status badge
		  needs more room than there is, and an ellipsised heading is worse than a badge on its own
		  line. The badge keeps a fixed width (badge-fixed), so which line it lands on never changes
		  while the status text does.
		-->
		<span class="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1">
			<span class="min-w-0">{title}</span>
			{#if badge}{@render badge()}{/if}
		</span>
	{/if}
{/snippet}

{#if level === 2}
	<h2 {id} class="flex min-w-0 text-lg">{@render inner()}</h2>
{:else}
	<h3 {id} class="flex min-w-0 text-base">{@render inner()}</h3>
{/if}
