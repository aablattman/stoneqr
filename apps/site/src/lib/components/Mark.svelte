<script lang="ts">
	/** The mark: a finder-like block with a copper centre, the same drawing as favicon.svg. */
	let { size = 22 }: { size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	aria-hidden="true"
	fill="none"
	stroke="currentColor"
	stroke-width="1.4"
>
	<rect x="1" y="1" width="22" height="22" rx="1" />
	<rect x="5" y="5" width="14" height="14" fill="currentColor" stroke="none" />
	<rect x="8" y="8" width="8" height="8" fill="var(--color-paper)" stroke="none" />
	<rect x="10" y="10" width="4" height="4" fill="var(--color-accent)" stroke="none" />
</svg>
