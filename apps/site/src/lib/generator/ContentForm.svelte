<script lang="ts">
	import { PAYLOAD_TYPES, type PayloadType } from '@stoneqr/engine/payloads';
	import Icon from '$lib/components/Icon.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import { radioKeys } from '$lib/components/radiogroup';
	import type { IconName } from '$lib/icons';
	import type { Design } from './state.svelte';

	let {
		design,
		pristine = true,
		onstartover,
		savedCount = 0,
		onsaved
	}: { design: Design; pristine?: boolean; onstartover?: () => void; savedCount?: number; onsaved?: () => void } = $props();

	let confirmReset = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;
	function startOver() {
		if (!confirmReset) {
			confirmReset = true;
			clearTimeout(confirmTimer);
			confirmTimer = setTimeout(() => (confirmReset = false), 4000);
			return;
		}
		confirmReset = false;
		clearTimeout(confirmTimer);
		onstartover?.();
	}

	const meta = $derived(PAYLOAD_TYPES.find((t) => t.id === design.type)!);
	const contactTypes: PayloadType[] = ['vcard', 'mecard'];

	/**
	 * Ten types in five columns, so the grid comes out exactly two full rows. Between lg and xl
	 * the column is 18rem and a tile has room for six mono characters, so "Calendar event" and
	 * "Location" are shortened for the tile; the full wording stays on the tile's accessible name
	 * and in the description line under the grid. A label that outgrows its tile is clipped with
	 * an ellipsis by `.type-name`, so check new words in a 1100 px window.
	 */
	const SHORT: Partial<Record<PayloadType, string>> = { event: 'Event', geo: 'Place' };
</script>

<section class="grid gap-5" aria-labelledby="content-heading">
	<SectionHeader title="Content" id="content-heading">
		{#snippet badge()}
			{#if design.shortUrl}
				<button type="button" class="text-sm underline" onclick={() => (design.shortUrl = null)}>Clear dynamic link</button>
			{:else if !pristine || savedCount}
				<!-- Saving and starting over live where the work began. "Save" appears once something
				     is set; it reads "Saved (n)" once there is a list to open. Start over asks twice
				     because it takes the saved design with it. The row is the heading's own height,
				     so showing either moves nothing. -->
				<span class="flex items-center gap-3 text-sm">
					<button type="button" class="underline text-ink-3 hover:text-ink" onclick={() => onsaved?.()}>
						{savedCount ? `Saved (${savedCount})` : 'Save'}
					</button>
					{#if !pristine}
						<button
							type="button"
							class="underline {confirmReset ? 'text-block' : 'text-ink-3 hover:text-ink'}"
							onclick={startOver}
						>
							{confirmReset ? 'Clear everything?' : 'Start over'}
						</button>
					{/if}
				</span>
			{/if}
		{/snippet}
	</SectionHeader>

	<div class="field">
		<span class="label">Type</span>
		<div class="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Content type" use:radioKeys>
			{#each PAYLOAD_TYPES as t (t.id)}
				<button
					type="button"
					role="radio"
					aria-checked={design.type === t.id}
					tabindex={design.type === t.id ? 0 : -1}
					aria-label={t.label}
					title={t.label}
					class="type-tile"
					data-on={design.type === t.id}
					onclick={() => design.reset(t.id)}
				>
					<Icon name={t.id as IconName} size={17} />
					<span class="type-name">{SHORT[t.id] ?? t.label}</span>
				</button>
			{/each}
		</div>
		<p class="hint">{meta.description}</p>
	</div>

	{#if design.shortUrl}
		<div class="notice notice-info">
			This code is editable and tracked in your SignUpCity account. It encodes
			<span class="num break-all">{design.shortUrl}</span>.
		</div>
	{:else if design.type === 'url'}
		<div class="field">
			<label for="f-url">Web address</label>
			<input id="f-url" class="input" type="url" inputmode="url" autocomplete="url" placeholder="https://example.com/menu" bind:value={design.fields.url.url} />
			<p class="hint">Shorter addresses make smaller, easier-to-scan codes.</p>
		</div>
	{:else if design.type === 'text'}
		<div class="field">
			<label for="f-text">Text</label>
			<textarea id="f-text" class="textarea" rows="4" placeholder="Anything a phone should display" bind:value={design.fields.text.text}></textarea>
		</div>
	{:else if design.type === 'wifi'}
		<div class="field">
			<label for="f-ssid">Network name (SSID)</label>
			<input id="f-ssid" class="input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={design.fields.wifi.ssid} />
		</div>
		<div class="field">
			<span class="label">Security</span>
			<div class="seg" role="group" aria-label="Security">
				<button type="button" aria-pressed={design.fields.wifi.auth === 'WPA'} onclick={() => (design.fields.wifi.auth = 'WPA')}>WPA / WPA2 / WPA3</button>
				<button type="button" aria-pressed={design.fields.wifi.auth === 'WEP'} onclick={() => (design.fields.wifi.auth = 'WEP')}>WEP</button>
				<button type="button" aria-pressed={design.fields.wifi.auth === 'nopass'} onclick={() => (design.fields.wifi.auth = 'nopass')}>Open</button>
			</div>
		</div>
		{#if design.fields.wifi.auth !== 'nopass'}
			<div class="field">
				<label for="f-pass">Password</label>
				<input id="f-pass" class="input mono" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={design.fields.wifi.password} />
				<p class="hint">Stays in your browser. Shown in plain text so you can check it.</p>
			</div>
		{/if}
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={design.fields.wifi.hidden} />
			Hidden network
		</label>
	{:else if contactTypes.includes(design.type)}
		{@const c = design.type === 'vcard' ? design.fields.vcard : design.fields.mecard}
		<div class="grid grid-cols-2 gap-3">
			<div class="field"><label for="f-first">First name</label><input id="f-first" class="input" autocomplete="given-name" bind:value={c.firstName} /></div>
			<div class="field"><label for="f-last">Last name</label><input id="f-last" class="input" autocomplete="family-name" bind:value={c.lastName} /></div>
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div class="field"><label for="f-org">Organisation</label><input id="f-org" class="input" autocomplete="organization" bind:value={c.org} /></div>
			{#if design.type === 'vcard'}
				<div class="field"><label for="f-title">Job title</label><input id="f-title" class="input" autocomplete="organization-title" bind:value={c.title} /></div>
			{/if}
		</div>
		<div class="grid grid-cols-2 gap-3">
			<div class="field"><label for="f-mobile">Mobile</label><input id="f-mobile" class="input num" type="tel" autocomplete="tel" bind:value={c.mobile} /></div>
			<div class="field"><label for="f-work">Work phone</label><input id="f-work" class="input num" type="tel" bind:value={c.work} /></div>
		</div>
		<div class="field"><label for="f-email">Email</label><input id="f-email" class="input" type="email" autocomplete="email" bind:value={c.email} /></div>
		<div class="field"><label for="f-curl">Website</label><input id="f-curl" class="input" type="url" bind:value={c.url} /></div>
		<details class="group">
			<summary class="ticket cursor-pointer select-none">Address and note</summary>
			<div class="mt-3 grid gap-3">
				<div class="field"><label for="f-street">Street</label><input id="f-street" class="input" autocomplete="street-address" bind:value={c.street} /></div>
				<div class="grid grid-cols-2 gap-3">
					<div class="field"><label for="f-city">City</label><input id="f-city" class="input" bind:value={c.city} /></div>
					<div class="field"><label for="f-region">State / region</label><input id="f-region" class="input" bind:value={c.region} /></div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="field"><label for="f-postal">Postal code</label><input id="f-postal" class="input" autocomplete="postal-code" bind:value={c.postal} /></div>
					<div class="field"><label for="f-country">Country</label><input id="f-country" class="input" autocomplete="country-name" bind:value={c.country} /></div>
				</div>
				<div class="field"><label for="f-note">Note</label><input id="f-note" class="input" bind:value={c.note} /></div>
			</div>
		</details>
		<p class="hint">
			{design.type === 'vcard'
				? 'vCard 3.0, the format phones read most reliably. No photo: it would make the code enormous.'
				: 'MeCard is about a third smaller than vCard and holds fewer fields.'}
		</p>
	{:else if design.type === 'email'}
		<div class="field"><label for="f-to">To</label><input id="f-to" class="input" type="email" autocomplete="off" placeholder="rsvp@example.com" bind:value={design.fields.email.to} /></div>
		<div class="field"><label for="f-subject">Subject</label><input id="f-subject" class="input" bind:value={design.fields.email.subject} /></div>
		<div class="field"><label for="f-body">Body</label><textarea id="f-body" class="textarea" rows="3" bind:value={design.fields.email.body}></textarea></div>
	{:else if design.type === 'sms'}
		<div class="field"><label for="f-smsto">Phone number</label><input id="f-smsto" class="input num" type="tel" placeholder="+1 555 555 0100" bind:value={design.fields.sms.to} /></div>
		<div class="field"><label for="f-smsbody">Message</label><textarea id="f-smsbody" class="textarea" rows="3" bind:value={design.fields.sms.body}></textarea></div>
		<div class="field">
			<span class="label">Format</span>
			<div class="seg" role="group" aria-label="SMS format">
				<button type="button" aria-pressed={design.fields.sms.scheme === 'sms'} onclick={() => (design.fields.sms.scheme = 'sms')}>sms: (iPhone, most Android)</button>
				<button type="button" aria-pressed={design.fields.sms.scheme === 'smsto'} onclick={() => (design.fields.sms.scheme = 'smsto')}>SMSTO: (older readers)</button>
			</div>
		</div>
	{:else if design.type === 'tel'}
		<div class="field">
			<label for="f-tel">Phone number</label>
			<input id="f-tel" class="input num" type="tel" placeholder="+1 555 555 0100" bind:value={design.fields.tel.number} />
			<p class="hint">Include the country code so it dials from abroad.</p>
		</div>
	{:else if design.type === 'geo'}
		<div class="grid grid-cols-2 gap-3">
			<div class="field"><label for="f-lat">Latitude</label><input id="f-lat" class="input num" inputmode="decimal" placeholder="39.7392" bind:value={design.fields.geo.lat} /></div>
			<div class="field"><label for="f-lng">Longitude</label><input id="f-lng" class="input num" inputmode="decimal" placeholder="-104.9903" bind:value={design.fields.geo.lng} /></div>
		</div>
		<div class="field"><label for="f-q">Label (optional)</label><input id="f-q" class="input" placeholder="Main entrance" bind:value={design.fields.geo.query} /></div>
	{:else if design.type === 'event'}
		<div class="field"><label for="f-summary">Title</label><input id="f-summary" class="input" bind:value={design.fields.event.summary} /></div>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={design.fields.event.allDay} />
			All day
		</label>
		<div class="grid grid-cols-2 gap-3">
			<div class="field">
				<label for="f-start">Starts</label>
				{#if design.fields.event.allDay}
					<input id="f-start" class="input num" type="date" value={design.fields.event.start.slice(0, 10)} oninput={(e) => (design.fields.event.start = e.currentTarget.value)} />
				{:else}
					<input id="f-start" class="input num" type="datetime-local" bind:value={design.fields.event.start} />
				{/if}
			</div>
			<div class="field">
				<label for="f-end">Ends</label>
				{#if design.fields.event.allDay}
					<input id="f-end" class="input num" type="date" value={design.fields.event.end.slice(0, 10)} oninput={(e) => (design.fields.event.end = e.currentTarget.value)} />
				{:else}
					<input id="f-end" class="input num" type="datetime-local" bind:value={design.fields.event.end} />
				{/if}
			</div>
		</div>
		<div class="field"><label for="f-loc">Location</label><input id="f-loc" class="input" bind:value={design.fields.event.location} /></div>
		<div class="field"><label for="f-desc">Description</label><textarea id="f-desc" class="textarea" rows="2" bind:value={design.fields.event.description}></textarea></div>
		<p class="hint">Times are converted to UTC inside the code, so they show correctly in any time zone.</p>
	{/if}

	{#if design.payloadError}
		<p class="notice notice-block" role="alert">{design.payloadError}</p>
	{/if}
</section>
