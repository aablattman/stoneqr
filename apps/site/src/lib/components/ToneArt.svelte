<script lang="ts">
	/**
	 * The picture inside a Artistic QR tone tile: the same tiny scene drawn three ways, so the
	 * difference between colour, black and white, and silhouette is visible rather than described.
	 * The greys are the luminances of the colours beside them, so the middle tile is honestly what
	 * the first one becomes.
	 */
	let { tone }: { tone: 'colour' | 'grey' | 'silhouette' } = $props();

	const palette = {
		colour: { sky: '#8fb8da', ground: '#6f9e5a', sun: '#e0a93b' },
		grey: { sky: '#b0b0b0', ground: '#8c8c8c', sun: '#b9b9b9' },
		silhouette: { sky: '#ffffff', ground: '#1b1917', sun: '#1b1917' }
	} as const;
	const c = $derived(palette[tone]);
</script>

<svg viewBox="0 0 24 24" aria-hidden="true">
	<rect x="1" y="1" width="22" height="22" rx="2" fill={c.sky} />
	<circle cx="8.5" cy="8.5" r="3.4" fill={c.sun} />
	<path d="M1 17.5l6-5 4.5 3.5L16 11l7 6.5V21a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" fill={c.ground} />
	<rect x="1" y="1" width="22" height="22" rx="2" fill="none" stroke="var(--color-rule-2)" stroke-width="0.8" />
</svg>
