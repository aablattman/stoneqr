<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import Generator from '$lib/generator/Generator.svelte';
</script>

<Seo title="Artistic QR code" description="Weave a photo or a built-in shape through a whole QR code for free. The picture is drawn in the modules themselves, generated in your browser, and decode-checked before download." />

<Generator preset="url" photoOpen={true}>
	{#snippet hero()}
	<h1 class="reveal">A photo woven through the code, and it still scans.</h1>
	<p class="reveal reveal-2 mt-2 max-w-2xl text-lg text-ink-2">Blend a photo or one of the built-in shapes through every square of the code, for a code nobody else has. <span class="hidden sm:inline">Error correction goes to H, and the download unlocks only after the code decodes on your device.</span></p>
	{/snippet}
</Generator>

<section class="mx-auto max-w-7xl px-4 sm:px-6">
	<div class="prose">
		<h2>How a picture fits inside a QR code</h2>
		<p>This is not the logo-in-the-middle code most people have seen. For that, <a href="/logo">put your logo in the middle</a>: the code stays an ordinary code with a clear space cut for the logo. Artistic QR turns the whole code into the picture instead, so it looks like nothing else on the wall, and asks a little more of the print.</p>
		<p>A scanner needs two things from a code: the three big corner squares and the smaller patterns that tell it where the grid is, and the colour at the centre of every module. It does not care what the rest of each module looks like. Artistic QR keeps the corner and grid patterns solid, then draws every other module as a small dot at its centre and lets your picture show through the space around it. Nothing is painted over the code and no error correction is spent hiding a picture, so the full budget is still there for print, glare, and a shaky hand.</p>
		<h3>Photo or silhouette</h3>
		<p>A photograph works best in colour or in black and white, with the crop sliders used to bring the subject into the middle. A mark, an icon, or a shape wants the Silhouette setting instead: it reduces the picture to solid ink and paper, so the shape comes out as crisp blocks rather than a soft blur, and the Cut slider decides where grey becomes ink. The built-in shapes (WiFi, heart, star, arrow, map pin, envelope, tick) are already silhouettes, in any colour; pick one and the code is ready, then set Shape to colour it. Only the shape takes that colour: the dots a scanner reads keep the code colour.</p>
		<h3>Get the most from it</h3>
		<ul>
			<li>Simple pictures read best. A face, a mark, or a bold shape survives the dots; a busy texture turns into noise.</li>
			<li>Watch the badge. Every change is decoded on your device, and if the first attempt fails the generator enlarges the dots or fades the picture a little and tells you what it changed.</li>
			<li>Print it larger than a plain code. The picture forces a denser symbol, so a code that would be fine at 25 mm plain wants 50 mm or more here. The print size panel does that sum for you.</li>
			<li>Test-scan a print before ordering signage. The download is a PNG at your chosen resolution or an SVG with the picture and the dots as separate layers.</li>
		</ul>
		<p>The picture never leaves your browser. It is decoded onto a canvas on your device, drawn into the code there, and forgotten when you close the tab.</p>
	</div>
</section>
