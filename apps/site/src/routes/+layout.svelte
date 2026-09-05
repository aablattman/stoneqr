<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import Mark from '$lib/components/Mark.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { NAV, SITE } from '$lib/site';
	import { FONT_PRELOADS } from '$lib/fonts';

	let { children } = $props();
	const current = $derived(page.url.pathname);

	// After the first client-side navigation the hero reveal animation is switched off (app.css),
	// so moving between pages feels like switching a tab rather than loading a new one.
	afterNavigate(({ type }) => {
		if (type !== 'enter') document.documentElement.dataset.navigated = '';
	});

	/**
	 * The service worker (src/service-worker.ts) is registered by SvelteKit's own init script. This
	 * only watches it: a newer version that has finished installing waits behind the running one
	 * until the visitor asks for it, so a page mid-edit is never swapped out underneath them; and
	 * the first time a worker is active on this device, one notice says the app now works offline.
	 * Both sit at the top of the page so they never share the bottom of a phone screen with
	 * PreviewBar. Skipped in dev, where the worker has no build to cache.
	 */
	let waiting: ServiceWorker | null = $state(null);
	let offlineReady = $state(false);
	let reloading = false;

	onMount(() => {
		if (dev || !('serviceWorker' in navigator)) return;
		const container = navigator.serviceWorker;
		const controlled = () => container.controller !== null;
		const track = (worker: ServiceWorker) => {
			worker.addEventListener('statechange', () => {
				if (worker.state === 'installed' && controlled()) waiting = worker;
			});
		};
		void container.ready.then((registration) => {
			if (registration.waiting && controlled()) waiting = registration.waiting;
			if (registration.installing) track(registration.installing);
			registration.addEventListener('updatefound', () => {
				if (registration.installing) track(registration.installing);
			});
			try {
				if (!localStorage.getItem('stoneqr.offlineNotice')) {
					localStorage.setItem('stoneqr.offlineNotice', '1');
					offlineReady = true;
					setTimeout(() => (offlineReady = false), 8000);
				}
			} catch {
				/* storage blocked: the notice just does not show */
			}
		});
		// clients.claim() on a first install also fires this; only a requested update reloads.
		container.addEventListener('controllerchange', () => {
			if (reloading) location.reload();
		});
	});

	function reloadForUpdate() {
		if (!waiting) return;
		reloading = true;
		waiting.postMessage({ type: 'SKIP_WAITING' });
	}
</script>

<svelte:head>
	<!-- Without these the fonts are discovered only after the stylesheet has arrived and been parsed. -->
	{#each FONT_PRELOADS as href (href)}
		<link rel="preload" {href} as="font" type="font/woff2" crossorigin="anonymous" />
	{/each}
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<!-- Invisible until it has focus: the first Tab press offers a way past the seven nav links. -->
	<a href="#main" class="skip-link">Skip to content</a>
	<div aria-live="polite">
		{#if waiting}
			<div class="border-b border-rule bg-accent-soft text-accent-ink">
				<div class="notice notice-info mx-auto max-w-7xl border-l-0 bg-transparent px-4 py-2 sm:px-6">
					<div class="row" style="grid-template-columns: minmax(0, 1fr) auto auto">
						<span>A new version of StoneQR is ready.</span>
						<button type="button" class="btn btn-sm btn-accent" onclick={reloadForUpdate}>Reload</button>
						<button type="button" class="chip" onclick={() => (waiting = null)}>Later</button>
					</div>
				</div>
			</div>
		{:else if offlineReady}
			<div class="border-b border-rule bg-accent-soft text-accent-ink">
				<div class="notice notice-info mx-auto max-w-7xl border-l-0 bg-transparent px-4 py-2 sm:px-6">
					<div class="row" style="grid-template-columns: minmax(0, 1fr) auto">
						<span><strong class="font-medium">Available offline.</strong> StoneQR now works without a connection on this device.</span>
						<button type="button" class="chip inline-flex items-center gap-1" onclick={() => (offlineReady = false)} aria-label="Dismiss">
							<Icon name="close" size={12} />
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
	<header class="border-b border-rule bg-paper/80 backdrop-blur-sm">
		<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
			<a href="/" class="display flex items-center gap-2 text-xl text-ink no-underline" aria-label="StoneQR home">
				<Mark size={22} />
				<span>Stone<span class="text-accent">QR</span></span>
			</a>
			<!-- preload-code=eager fetches every nav route's chunk right after load, so a click needs no network. -->
			<nav
				aria-label="Primary"
				class="nav-scroll -mx-1 flex w-full min-w-0 items-center gap-x-1 overflow-x-auto px-1 text-sm md:w-auto md:flex-wrap md:overflow-visible"
				data-sveltekit-preload-code="eager"
			>
				{#each NAV as item (item.href)}
					<a
						href={item.href}
						aria-current={current === item.href ? 'page' : undefined}
						class="shrink-0 rounded px-2 py-1 text-ink-2 no-underline hover:bg-paper-2 hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
					>
						{item.label}
					</a>
				{/each}
			</nav>
			<p class="ticket ml-auto hidden lg:block">Free · Open source · No account</p>
		</div>
	</header>

	<main id="main" class="flex-1">
		{@render children()}
	</main>

	<footer class="mt-16 border-t border-rule bg-paper-2/60">
		<div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
			<div>
				<p class="display text-lg">Stone<span class="text-accent">QR</span></p>
				<p class="mt-1 text-sm text-ink-2">{SITE.tagline}</p>
				<p class="mt-3 text-sm text-ink-3">
					Static codes are generated on your device and never sent anywhere. We cannot deactivate
					them because we never had them.
				</p>
			</div>
			<div class="text-sm">
				<p class="ticket mb-2">Tools</p>
				<ul class="grid gap-1">
					<li><a href="/">QR code generator</a></li>
					<li><a href="/wifi">WiFi QR code</a></li>
					<li><a href="/vcard">vCard QR code</a></li>
					<li><a href="/event">Calendar event QR code</a></li>
					<li><a href="/logo">QR code with logo</a></li>
					<li><a href="/photo">Photo QR code</a></li>
					<li><a href="/print-size">Print size calculator</a></li>
					<li><a href="/bulk">Bulk and label sheets</a></li>
				</ul>
			</div>
			<div class="text-sm">
				<p class="ticket mb-2">About</p>
				<ul class="grid gap-1">
					<li><a href="/never-expires">Why these codes never expire</a></li>
					<li><a href="/compare">Compare generators</a></li>
					<li><a href="/open-source">Open source (MIT)</a></li>
					<li><a href="/privacy">Privacy</a></li>
					<li><a href={SITE.repo} rel="noopener">Source on GitHub</a></li>
					<li><a href={SITE.scanReport} rel="noopener">Report a scan result</a></li>
				</ul>
				<p class="mt-4 text-ink-3">
					Made by <a href={SITE.makerUrl} rel="me noopener">{SITE.maker}</a>, who also makes
					<a href={SITE.signupcity} rel="noopener">SignUpCity</a>. Questions or a scan that
					failed: <a href="mailto:{SITE.email}">{SITE.email}</a>.
				</p>
			</div>
		</div>
	</footer>
</div>
