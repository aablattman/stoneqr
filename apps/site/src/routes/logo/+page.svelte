<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import Generator from '$lib/generator/Generator.svelte';
</script>

<Seo title="QR code with logo" description="Add a logo to a QR code for free, with the error correction raised automatically, a size cap, and a decode check so the printed code still scans." />

<Generator preset="url" styleOpen={true}>
	{#snippet hero()}
	<h1 class="reveal">A logo in the middle, and it still scans.</h1>
	<p class="reveal reveal-2 mt-2 max-w-2xl text-lg text-ink-2">Error correction goes to H automatically, the size is capped at what the code can afford to lose, and the download unlocks only after the code decodes.</p>
	{/snippet}
</Generator>

<section class="mx-auto max-w-7xl px-4 sm:px-6">
	<div class="prose">
		<h2>Why logos work at all</h2>
		<p>QR codes carry error correction: at level H, about 30 percent of the code can be covered or damaged and it still reads. A centred logo spends part of that budget, and everything else that goes wrong in the real world spends the rest. This page raises the level to H when you add a picture, clears the modules under it, keeps the corner finder patterns untouched, and stops you once the logo would hide more than a fifth of the code.</p>
		<p>The size control asks for a width, as a share of the code's width, and the readout tells you what you actually got. Those two can differ by a point or two, because a logo can only occupy a whole odd number of modules: on a small code the reachable sizes are a short staircase, and the readout steps up it rather than pretending the slider is smooth. In Advanced the readout also says how much of the code the logo hides, which is the number the warnings are set against.</p>
		<p>PNG, JPEG, WebP, and SVG all work. An SVG stays vector the whole way through, so the SVG download holds your logo as real curves for a print shop to scale, rather than a picture of it. Uploaded SVGs are rebuilt in your browser first: script, animation, and anything pointing at a file on the internet are stripped out, styles are baked onto the shapes they belong to, and the drawing is held inside its own box. You are told what was changed.</p>
		<h3>Get the most from a logo</h3>
		<ul>
			<li>Watch the readout rather than the slider. Amber means error correction is doing most of the work; red means the download is locked until you shrink it.</li>
			<li>Leave the clear space behind the logo on. It gives the scanner a clean edge to work with. Turning it off paints the logo straight over the modules, which looks busier and asks more of the scan.</li>
			<li>A longer link makes a denser code, which has more modules to spare, so the same logo hides proportionally less. Shortening the content is the other way to make room.</li>
			<li>Convert text in an SVG to outlines before uploading. Live text falls back to whatever font the reader has, which is rarely yours.</li>
			<li>Watch the badge: the code is decoded on your device every time you change something. If it says "did not decode", shrink the logo or add a module of margin.</li>
			<li>Higher error correction makes the code denser, so check the print size panel again after adding the logo.</li>
		</ul>
	</div>
</section>
