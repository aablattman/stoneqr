<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { APP_SCHEMA } from '$lib/schema';
	import Generator from '$lib/generator/Generator.svelte';
	import { SITE } from '$lib/site';
</script>

<Seo
	title={SITE.name}
	schema={[APP_SCHEMA]}
	description="Free QR code generator with no sign-up and no expiry. Codes are generated in your browser and never uploaded. Vector SVG, PDF, and EPS exports, print-size calculator, logos, artistic QR codes, and decode verification." />

<Generator>
	{#snippet hero()}
	<h1 class="reveal hero-cut"><span class="cut">QR codes</span> <span class="cut-hollow">set in stone.</span></h1>
	<p class="reveal reveal-2 mt-4 max-w-2xl text-lg text-ink-2">
		Generated in your browser, never uploaded, never expire. <span class="hidden sm:inline">Vector files
		with real millimetre sizes, a print-size check, and a decode test before every download.</span>
	</p>
	{/snippet}
</Generator>

<!--
  Below the tool: the case for the site, laid out as a slab of three cut sections rather than a
  column of prose. The copy is the same; the numerals are decoration.
-->
<section class="mx-auto max-w-7xl px-4 pt-10 sm:px-6" aria-labelledby="why-heading">
	<div class="grid gap-10 border-t border-rule pt-12 lg:grid-cols-12 lg:gap-12">
		<div class="lg:col-span-5">
			<p class="ticket">Why static</p>
			<h2 id="why-heading" class="mt-3 text-[clamp(1.6rem,3.4vw,2.6rem)]">Free means free, and static means forever</h2>
			<p class="mt-5 text-ink-2">
				Most "free" QR generators hand you a code that points at their own server, then stop
				forwarding it when a trial ends. The codes on this page contain your content directly, so
				there is nothing to switch off. There is no account, no email, and nothing you type leaves
				your device. <a href="/never-expires">Here is how that works.</a>
			</p>
		</div>
		<div class="grid gap-5 sm:grid-cols-2 lg:col-span-7">
			<article class="sheet p-6">
				<p class="numeral" aria-hidden="true">01</p>
				<h3 class="mt-4">Made for printing</h3>
				<p class="mt-3 text-[0.95rem] text-ink-2">
					Choose a print width and the panel tells you the module size, how far away the code can be
					read from, and when the content is too long for the space. Download SVG, PDF (with 100% K
					black), EPS, or PNG at 300 dpi with the resolution recorded in the file. The
					<a href="/print-size">print-size calculator</a> is also available on its own page, and a
					one-page test sheet prints the code at four sizes so you can scan before ordering signage.
				</p>
			</article>
			<article class="sheet p-6">
				<p class="numeral" aria-hidden="true">02</p>
				<h3 class="mt-4">Every content type a phone understands</h3>
				<p class="mt-3 text-[0.95rem] text-ink-2">
					Links, <a href="/wifi">WiFi networks</a>, <a href="/vcard">contact cards</a>, email, SMS, phone
					numbers, map pins, and <a href="/event">calendar events</a>, formatted the way phone cameras
					expect. Put your <a href="/logo">logo in the middle</a>, choose colours with a contrast check, add a frame
					with a call to action, or weave a photo through the whole code with <a href="/photo">Artistic QR</a>.
				</p>
			</article>
		</div>
	</div>
</section>
