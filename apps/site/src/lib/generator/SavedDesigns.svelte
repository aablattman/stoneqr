<script lang="ts">
	/**
	 * The saved-designs card: save the working design under a name, and open, rename, file, or
	 * delete the ones already saved. Opened from the "Save" / "Saved (n)" link in the Content
	 * heading. It is a modal <dialog> for the reason ColourPopover is: a press outside lands on
	 * the backdrop and closes it without pressing whatever sits underneath.
	 *
	 * Opening a saved design writes it over the working design, which the autosave then keeps,
	 * so it asks first when there is unsaved work. Deleting asks twice, like "Start over".
	 * Everything stays in this browser; the file buttons are the way out and back in.
	 */
	import { tick } from 'svelte';
	import type { PayloadType } from '@stoneqr/engine/payloads';
	import Icon from '$lib/components/Icon.svelte';
	import { downloadText, slug } from '$lib/download';
	import type { Design } from './state.svelte';
	import { apply, snapshot } from './persist';
	import {
		listSaved, saveDesign, renameSaved, deleteSaved, readPictures, suggestName, tidyName,
		toFile, fromFile, writeOpened, FILE_SUFFIX, type SavedDesign, type Opened
	} from './saved';

	let {
		design,
		open = $bindable(false),
		count = $bindable(0),
		opened = $bindable(null),
		pristine = true
	}: {
		design: Design;
		open?: boolean;
		/** How many designs are saved, for the link that opens this card. */
		count?: number;
		/** The saved design the working design came from, if any. */
		opened?: Opened | null;
		pristine?: boolean;
	} = $props();

	const LABEL: Record<PayloadType, string> = {
		url: 'Website', text: 'Text', wifi: 'WiFi', vcard: 'Contact', mecard: 'Contact',
		email: 'Email', sms: 'Message', tel: 'Phone number', geo: 'Location', event: 'Event'
	};

	let dialog = $state<HTMLDialogElement>();
	let nameInput = $state<HTMLInputElement>();
	let fileInput = $state<HTMLInputElement>();
	let list = $state<SavedDesign[]>([]);
	let name = $state('');
	let error = $state('');
	let busy = $state(false);
	/** A pending second click: which row and which action. */
	let confirm = $state<{ id: string; action: 'open' | 'delete' | 'file' } | null>(null);
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;
	let renaming = $state<{ id: string; name: string } | null>(null);

	const currentJson = $derived(JSON.stringify(snapshot(design)));
	/** The working design differs from the saved one it came from. */
	const dirty = $derived(!!opened && opened.json !== currentJson);
	/** Nothing to lose by opening another: no work, or work that is saved as it stands. */
	const safeToReplace = $derived(pristine || (!!opened && !dirty));

	const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

	$effect(() => {
		void refresh();
	});
	async function refresh() {
		list = await listSaved();
		count = list.length;
		// The open design may have been deleted from another tab; forget it rather than update a ghost.
		if (opened && !list.some((d) => d.id === opened!.id)) setOpened(null);
	}

	$effect(() => {
		const d = dialog;
		if (!d) return;
		if (open) {
			if (!d.open) {
				error = '';
				confirm = null;
				renaming = null;
				name = opened?.name ?? suggestName(design.type, design.fields);
				void refresh();
				d.showModal();
				tick().then(() => nameInput?.focus());
			}
		} else if (d.open) {
			d.close();
		}
	});

	function setOpened(next: Opened | null) {
		opened = next;
		writeOpened(next);
	}

	function ask(id: string, action: 'open' | 'delete' | 'file'): boolean {
		if (confirm?.id === id && confirm.action === action) {
			confirm = null;
			clearTimeout(confirmTimer);
			return true;
		}
		confirm = { id, action };
		clearTimeout(confirmTimer);
		confirmTimer = setTimeout(() => (confirm = null), 4000);
		return false;
	}

	function fail(e: unknown, what: string) {
		const msg = e instanceof Error ? e.message : String(e);
		error = /quota/i.test(msg)
			? `Could not ${what}: this browser's storage is full. Delete a saved design or free some space, then try again.`
			: `Could not ${what}. ${msg || 'The browser refused.'}`;
	}

	/** Save the working design: over the open one when it is, or as a new one. */
	async function save(asNew = false) {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const record = snapshot(design);
			const saved = await saveDesign({
				id: asNew ? undefined : (opened?.id ?? undefined),
				name: tidyName(name) || suggestName(design.type, design.fields),
				type: design.type,
				thumb: design.plainSvg,
				record,
				logo: design.logo,
				halftone: design.halftoneImage
			});
			setOpened({ id: saved.id, name: saved.name, json: JSON.stringify(record) });
			name = saved.name;
			await refresh();
		} catch (e) {
			fail(e, 'save');
		} finally {
			busy = false;
		}
	}

	async function openDesign(d: SavedDesign) {
		if (!safeToReplace && !ask(d.id, 'open')) return;
		error = '';
		const pictures = await readPictures(d.id);
		if (!apply(design, d.record)) {
			error = 'That saved design could not be read.';
			return;
		}
		design.logo = pictures.logo;
		if (!pictures.logo) design.logoName = '';
		design.halftoneImage = pictures.halftone;
		if (!pictures.halftone) design.halftoneImageName = '';
		setOpened({ id: d.id, name: d.name, json: JSON.stringify(snapshot(design)) });
		open = false;
	}

	async function remove(d: SavedDesign) {
		if (!ask(d.id, 'delete')) return;
		error = '';
		try {
			await deleteSaved(d.id);
			if (opened?.id === d.id) setOpened(null);
			await refresh();
		} catch (e) {
			fail(e, 'delete');
		}
	}

	function startRename(d: SavedDesign) {
		renaming = { id: d.id, name: d.name };
		tick().then(() => (document.getElementById(`rename-${d.id}`) as HTMLInputElement | null)?.select());
	}
	async function finishRename() {
		if (!renaming) return;
		const { id, name: next } = renaming;
		renaming = null;
		if (!tidyName(next)) return;
		try {
			await renameSaved(id, next);
			if (opened?.id === id) setOpened({ ...opened, name: tidyName(next) });
			await refresh();
		} catch (e) {
			fail(e, 'rename');
		}
	}

	async function toFileOf(d: SavedDesign) {
		error = '';
		const pictures = await readPictures(d.id);
		downloadText(toFile(d, pictures), slug(d.name, 'design') + FILE_SUFFIX, 'application/json');
	}

	/** A file becomes a new saved design and is opened. */
	async function fromFileInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		error = '';
		const parsed = fromFile(await file.text());
		if (!parsed) {
			error = 'That is not a StoneQR design file.';
			return;
		}
		if (!safeToReplace && !ask('file', 'file')) {
			error = 'Opening a file replaces the design you are working on. Choose the file again to go ahead, or save first.';
			return;
		}
		// A design file comes off the person's disk, so an SVG logo in one is untrusted markup and
		// is rebuilt exactly as an upload would be. Every other way a logo reaches the design has
		// already been through that: the upload tile, or this browser's own storage.
		const notes = [...parsed.notes];
		let logo = parsed.logo;
		if (logo && /^data:image\/svg\+xml[;,]/i.test(logo)) {
			try {
				const { prepareSvgLogo, decodeSvgDataUrl } = await import('$lib/logo-svg');
				logo = prepareSvgLogo(decodeSvgDataUrl(logo)).dataUrl;
			} catch {
				logo = undefined;
				notes.push('The logo in that file could not be read, so the design opened without it.');
			}
		}
		apply(design, parsed.record);
		design.type = parsed.type;
		design.logo = logo;
		if (!logo) design.logoName = '';
		design.halftoneImage = parsed.halftone;
		if (!parsed.halftone) design.halftoneImageName = '';
		try {
			const record = snapshot(design);
			// The rebuilt logo is what gets kept, never the file's own markup.
			const saved = await saveDesign({
				name: parsed.name, type: design.type, thumb: design.plainSvg, record, logo, halftone: parsed.halftone
			});
			setOpened({ id: saved.id, name: saved.name, json: JSON.stringify(record) });
			await refresh();
			// The design is open either way; a note keeps the dialog up so it can be read.
			if (notes.length) error = notes.join(' ');
			else open = false;
		} catch (err) {
			fail(err, 'keep the opened file');
		}
	}

	function pictures(d: SavedDesign): string {
		return d.hasHalftone ? ' · photo' : d.hasLogo ? ' · logo' : '';
	}
</script>

<dialog
	bind:this={dialog}
	class="modal"
	aria-labelledby="saved-heading"
	onclose={() => (open = false)}
	oncancel={() => (open = false)}
	onpointerdown={(e) => {
		if (e.target === e.currentTarget) open = false;
	}}
>
	<div class="grid gap-5 p-5">
		<div class="flex items-center justify-between gap-3">
			<h2 id="saved-heading" class="text-xl">Saved designs</h2>
			<button type="button" class="picker-tool" aria-label="Close" onclick={() => (open = false)}>
				<Icon name="close" size={14} />
			</button>
		</div>

		{#if !pristine}
			<form
				class="grid gap-2"
				onsubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<label class="label" for="saved-name">
					{#if opened}This design is “{opened.name}”{dirty ? ', changed since it was saved' : ''}{:else}Save the design you are working on{/if}
				</label>
				<div class="flex gap-2">
					<input id="saved-name" class="input min-w-0 flex-1" type="text" bind:this={nameInput} bind:value={name} maxlength="120" autocomplete="off" placeholder="Name" />
					<button type="submit" class="btn btn-sm" disabled={busy}>
						{opened ? (dirty || tidyName(name) !== opened.name ? 'Update' : 'Saved') : 'Save'}
					</button>
				</div>
				{#if opened}
					<button type="button" class="justify-self-start text-sm underline" disabled={busy} onclick={() => save(true)}>
						Save as a new design
					</button>
				{/if}
			</form>
			<hr class="rule" />
		{/if}

		{#if list.length}
			<ul class="grid gap-3">
				{#each list as d (d.id)}
					<li class="flex items-center gap-3">
						<div class="saved-thumb" aria-hidden="true">{@html d.thumb}</div>
						<div class="min-w-0 flex-1">
							{#if renaming?.id === d.id}
								<input
									id="rename-{d.id}"
									class="input w-full px-2 py-1 text-sm"
									type="text"
									aria-label="New name"
									maxlength="120"
									bind:value={renaming.name}
									onblur={finishRename}
									onkeydown={(e) => {
										if (e.key === 'Enter') { e.preventDefault(); finishRename(); }
										if (e.key === 'Escape') { e.stopPropagation(); renaming = null; }
									}}
								/>
							{:else}
								<p class="truncate font-medium">
									{d.name}{#if opened?.id === d.id}<span class="text-ink-3 font-normal">{' · open'}</span>{/if}
								</p>
							{/if}
							<p class="text-xs text-ink-3">{LABEL[d.type] ?? d.type} · {dateFmt.format(d.updated)}{pictures(d)}</p>
							<p class="flex flex-wrap gap-x-3 text-sm">
								<button type="button" class="underline {confirm?.id === d.id && confirm.action === 'open' ? 'text-block' : ''}" onclick={() => openDesign(d)}>
									{confirm?.id === d.id && confirm.action === 'open' ? 'Replace your current design?' : 'Open'}
								</button>
								<button type="button" class="text-ink-3 underline hover:text-ink" onclick={() => startRename(d)}>Rename</button>
								<button type="button" class="text-ink-3 underline hover:text-ink" onclick={() => toFileOf(d)}>Download file</button>
								<button type="button" class="underline {confirm?.id === d.id && confirm.action === 'delete' ? 'text-block' : 'text-ink-3 hover:text-ink'}" onclick={() => remove(d)}>
									{confirm?.id === d.id && confirm.action === 'delete' ? 'Delete for good?' : 'Delete'}
								</button>
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">Nothing saved yet.</p>
		{/if}

		{#if error}
			<p class="notice notice-block" role="alert">
				<Icon name="warning" size={15} />
				<span>{error}</span>
			</p>
		{/if}

		<hr class="rule" />
		<div class="grid gap-2">
			<button type="button" class="btn btn-secondary btn-sm justify-self-start" onclick={() => fileInput?.click()}>
				{confirm?.id === 'file' ? 'Choose the file again to replace your design' : 'Open a design file…'}
			</button>
			<input bind:this={fileInput} type="file" accept=".json,application/json" class="sr-only" tabindex="-1" onchange={fromFileInput} />
			<p class="hint">
				Saved designs stay in this browser on this device, pictures included, and are never sent anywhere. Download a design as a file to keep a copy, move it to another device, or guard against the browser clearing its storage.
			</p>
		</div>
	</div>
</dialog>
