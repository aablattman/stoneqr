<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { SITE } from '$lib/site';
</script>

<Seo
	title="Open source"
	description="StoneQR is MIT-licensed. The whole site and its QR engine are public, so you can verify that nothing you type leaves your browser."
/>

<article class="mx-auto max-w-7xl px-4 py-12 sm:px-6">
	<p class="ticket reveal">MIT licence · Verify it yourself</p>
	<h1 class="reveal reveal-2 mt-3 max-w-3xl">The whole thing is public, engine included.</h1>
	<p class="reveal reveal-3 mt-5 max-w-2xl text-lg text-ink-2">
		"Nothing leaves your browser" is only worth something if you can check. The site and the
		<code class="rounded bg-paper-2 px-1 font-mono text-base">@stoneqr/engine</code> package are on
		GitHub under the MIT licence.
	</p>

	<div class="prose mt-12">
		<h2>How to verify nothing is uploaded</h2>
		<ol>
			<li>Open this site, then open your browser's developer tools and switch to the Network tab.</li>
			<li>Type a WiFi password or a phone number into the generator and download a file.</li>
			<li>Watch the Network tab: the only requests are the page's own scripts, styles, and fonts, all loaded before you typed anything. No request carries your content.</li>
			<li>For a stronger check, load the page, disconnect from the internet, and keep generating. Everything still works.</li>
		</ol>

		<h2>What is in the repository</h2>
		<ul>
			<li><strong>packages/engine</strong>: encoding, payload formats, sizing math, decode verification, and the SVG, PDF, EPS, and PNG exporters. Pure TypeScript with tests; no DOM required.</li>
			<li><strong>apps/site</strong>: this SvelteKit site, prerendered to static files and served from a CDN. There is no server code.</li>
			<li><strong>docs</strong>: the technical research and the real-phone scan matrix.</li>
		</ul>

		<h2>Libraries</h2>
		<p>
			Encoding uses <code>uqr</code>, a port of Nayuki's reference QR encoder. Verification decodes
			every export with <code>@paulmillr/qr</code>. Styled shapes and logos use
			<code>@liquid-js/qr-code-styling</code>, loaded only when you open the style panel. PDFs are
			built with <code>pdf-lib</code>. EPS and PNG resolution metadata are hand-written.
		</p>

		<h2>Who made this, and what is the catch</h2>
		<p>
			StoneQR is made by <a href={SITE.makerUrl} rel="me noopener">{SITE.maker}</a>, an executive assistant who prints a lot of QR codes and
			got tired of the ones that stopped working when a free trial lapsed. There is no catch. The
			site is static files on a CDN, which costs nothing to run, so it needs no account, no
			subscription, and no plan to add either. The same person makes
			<a href={SITE.signupcity} rel="noopener">SignUpCity</a>, a separate product for event
			pages; StoneQR does not depend on it. Questions, a scan that failed, or a printer that
			disagrees with the size calculator:
			<a href="mailto:{SITE.email}">{SITE.email}</a>, or open an issue on GitHub.
		</p>
		<h2>Use the engine in your own project</h2>
		<p>
			The engine is a small, dependency-light package you can use in Node, Workers, or the browser.
			It returns the raw module matrix along with the function-pattern mask, which is what you need
			for custom renderers.
		</p>
	</div>

	<p class="mt-12 flex flex-wrap gap-3">
		<a href={SITE.repo} rel="noopener" class="btn">View the source on GitHub</a>
		<a href="/privacy" class="btn btn-secondary">Privacy in two paragraphs</a>
	</p>
</article>
