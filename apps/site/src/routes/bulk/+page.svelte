<script lang="ts">
	import { onDestroy } from 'svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DropTile from '$lib/components/DropTile.svelte';
	import ColourField from '$lib/components/ColourField.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import { MODULE_MM_WARN, moduleMm, type Ecc } from '@stoneqr/engine';
	import type { LabelItem } from '@stoneqr/engine/labels';
	import { downloadBytes } from '$lib/download';
	import { SITE } from '$lib/site';
	import { BulkWorker, Cancelled } from '$lib/bulk/client';
	import { loadLabels, type LabelsModule } from '$lib/bulk/labels';
	import {
		MAX_ROWS,
		matrixOffsets,
		toPayload,
		unpackMatrix,
		type BulkItem,
		type BulkPayloadType,
		type BulkRow
	} from '$lib/bulk/protocol';
	import {
		columnChoices,
		guessColumns,
		parseCsvFile,
		parsePasted,
		rowsFromTable,
		type CsvTable,
		type ParsedInput
	} from '$lib/bulk/parse';

	/* ------------------------------------------------------------------- input */

	let source = $state<'paste' | 'csv'>('paste');
	let pasted = $state('');
	let settled = $state('');
	let table = $state.raw<CsvTable | null>(null);
	let hasHeader = $state(true);
	let payloadCol = $state(0);
	let labelCol = $state(-1);
	let csvError = $state('');

	// Parsing two thousand lines on every keystroke is wasted work; settle first.
	$effect(() => {
		const value = pasted;
		const timer = setTimeout(() => (settled = value), 180);
		return () => clearTimeout(timer);
	});

	const parsed = $derived<ParsedInput>(
		source === 'csv'
			? table
				? rowsFromTable(table, hasHeader, payloadCol, labelCol, MAX_ROWS)
				: { rows: [], total: 0, dropped: 0 }
			: parsePasted(settled, MAX_ROWS)
	);
	const choices = $derived(table ? columnChoices(table, hasHeader) : []);

	/** Takes the file itself: the drop tile hands one over from a drop as well as a click. */
	async function onCsvFile(file: File) {
		csvError = '';
		try {
			const read = await parseCsvFile(file);
			hasHeader = read.looksLikeHeader;
			const guess = guessColumns(read, hasHeader);
			payloadCol = guess.payload;
			labelCol = guess.label;
			table = read;
			source = 'csv';
		} catch (e) {
			table = null;
			csvError = e instanceof Error ? e.message : String(e);
		}
	}

	/* ----------------------------------------------------------------- options */

	let type = $state<BulkPayloadType>('url');
	let ecc = $state<Ecc>('M');
	let quiet = $state(4);
	let fg = $state('#000000');
	let bg = $state('#ffffff');
	let width = $state(30);
	let dpi = $state(300);

	// Number inputs go empty (NaN) while being retyped; keep the maths on solid ground.
	const quietZone = $derived(Number.isFinite(quiet) ? Math.max(0, Math.min(10, quiet)) : 4);
	const widthMm = $derived(Number.isFinite(width) && width > 0 ? width : 30);

	const preview = $derived(
		parsed.rows.slice(0, 5).map((row) => {
			try {
				return { ...row, encoded: toPayload(row.payload, type), error: '' };
			} catch (e) {
				return { ...row, encoded: '', error: e instanceof Error ? e.message : String(e) };
			}
		})
	);

	/* --------------------------------------------------------------------- run */

	const runner = new BulkWorker();
	onDestroy(() => runner.dispose());

	let items = $state.raw<BulkItem[] | null>(null);
	/** Packed matrices, kept off the reactive graph: up to about 2 MB of module bytes. */
	let bits: Uint8Array | null = null;
	let phase = $state<'idle' | 'generating' | 'zipping'>('idle');
	let zipFormat = $state<'svg' | 'png'>('svg');
	let done = $state(0);
	let goal = $state(0);
	let runError = $state('');
	let elapsed = $state(0);

	function clearResults() {
		items = null;
		bits = null;
		runError = '';
		elapsed = 0;
	}

	// Anything that changes what gets encoded, or the colours it is decode-tested in, invalidates
	// the run. Size and resolution are applied when a file is written, so they do not.
	$effect(() => {
		parsed.rows;
		type;
		ecc;
		fg;
		bg;
		clearResults();
	});

	async function generate() {
		if (phase !== 'idle' || parsed.rows.length === 0) return;
		clearResults();
		phase = 'generating';
		done = 0;
		goal = parsed.rows.length;
		const started = performance.now();
		try {
			const rows: BulkRow[] = parsed.rows.map((row) => ({ payload: row.payload, label: row.label }));
			const result = await runner.generate(rows, { type, ecc, fg, bg }, (n) => (done = n));
			items = result.items;
			bits = result.bits;
			elapsed = performance.now() - started;
		} catch (e) {
			if (!(e instanceof Cancelled)) runError = e instanceof Error ? e.message : String(e);
		} finally {
			phase = 'idle';
		}
	}

	async function downloadZip(format: 'svg' | 'png') {
		if (phase !== 'idle' || !items || !bits) return;
		phase = 'zipping';
		zipFormat = format;
		done = 0;
		goal = items.length;
		runError = '';
		try {
			const bytes = await runner.zip(
				items,
				bits,
				{ format, widthMm, dpi, quietZone, fg, bg },
				(n) => (done = n)
			);
			const name =
				format === 'svg'
					? `stoneqr-bulk-svg-${widthMm}mm.zip`
					: `stoneqr-bulk-png-${widthMm}mm-${dpi}dpi.zip`;
			downloadBytes(bytes, name, 'application/zip');
		} catch (e) {
			if (!(e instanceof Cancelled)) runError = e instanceof Error ? e.message : String(e);
		} finally {
			phase = 'idle';
		}
	}

	function cancel() {
		runner.cancel();
		phase = 'idle';
	}

	const pct = $derived(goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0);

	/* ----------------------------------------------------------------- summary */

	const good = $derived(items ? items.filter((item) => item.size > 0) : []);
	const unverified = $derived(good.filter((item) => !item.verified));
	const rejected = $derived(items ? items.filter((item) => item.size === 0) : []);
	const remasked = $derived(good.filter((item) => item.remasked).length);
	const lowVersion = $derived(good.reduce((n, item) => Math.min(n, item.version), 40));
	const highVersion = $derived(good.reduce((n, item) => Math.max(n, item.version), 0));
	const widestSize = $derived(good.reduce((n, item) => Math.max(n, item.size), 0));
	const smallestModule = $derived(widestSize > 0 ? moduleMm(widthMm, widestSize, quietZone) : 0);
	const tooSmall = $derived(smallestModule > 0 && smallestModule < MODULE_MM_WARN);

	function rowNumbers(list: BulkItem[], max = 10): string {
		const shown = list.slice(0, max).map((item) => item.index + 1).join(', ');
		return list.length > max ? `${shown}, and ${list.length - max} more` : shown;
	}

	/* ------------------------------------------------------------------ labels */

	/** `$state.raw` so the module namespace object is never wrapped in a reactive proxy. */
	let labelsMod = $state.raw<LabelsModule | null>(null);
	let labelsOpen = $state(false);
	let sheetId = $state('5160');
	let start = $state(1);
	let caption = $state<'label' | 'none'>('label');
	let outlines = $state(false);
	let pdfBusy = $state('');

	/** pdf-lib is a big dependency; it loads only when someone opens the label panel. */
	async function labels(): Promise<LabelsModule> {
		const mod = await loadLabels();
		labelsMod = mod;
		return mod;
	}

	const sheetList = $derived(labelsMod ? Object.values(labelsMod.sheets) : []);
	const perSheet = $derived(labelsMod ? labelsMod.labelsPerSheet(sheetId) : 0);
	const startAt = $derived(
		Number.isFinite(start) ? Math.max(0, Math.min(perSheet > 0 ? perSheet - 1 : 0, start - 1)) : 0
	);
	const pages = $derived(
		labelsMod && good.length > 0 ? labelsMod.sheetsNeeded(good.length, sheetId, startAt) : 0
	);
	const currentSheet = $derived(sheetList.find((sheet) => sheet.id === sheetId));

	async function labelPdf() {
		if (!items || !bits || pdfBusy) return;
		pdfBusy = 'labels';
		runError = '';
		try {
			const mod = await labels();
			const offsets = matrixOffsets(items);
			const list: LabelItem[] = [];
			for (let i = 0; i < items.length; i++) {
				const item = items[i]!;
				if (item.size === 0) continue;
				list.push({
					qr: { matrix: unpackMatrix(bits, offsets[i]!, item.size), size: item.size },
					label: item.label,
					payload: item.payload
				});
			}
			// The same colours and width as the ZIP; the engine holds the width to what the label allows.
			const pdf = await mod.layoutLabels(list, sheetId, { quietZone, caption, outlines, startAt, fg, bg, codeSizeMm: widthMm });
			downloadBytes(pdf, `stoneqr-labels-${sheetId}.pdf`, 'application/pdf');
		} catch (e) {
			runError = e instanceof Error ? e.message : String(e);
		} finally {
			pdfBusy = '';
		}
	}

	async function calibrationPdf() {
		if (pdfBusy) return;
		pdfBusy = 'calibration';
		runError = '';
		try {
			const mod = await labels();
			downloadBytes(
				await mod.calibrationSheet(sheetId),
				`stoneqr-calibration-${sheetId}.pdf`,
				'application/pdf'
			);
		} catch (e) {
			runError = e instanceof Error ? e.message : String(e);
		} finally {
			pdfBusy = '';
		}
	}

	async function openLabels() {
		labelsOpen = !labelsOpen;
		if (!labelsOpen) return;
		try {
			await labels();
		} catch (e) {
			runError = e instanceof Error ? e.message : String(e);
		}
	}

	const eccs: Ecc[] = ['L', 'M', 'Q', 'H'];
</script>

<Seo
	title="Bulk QR codes and label sheets"
	description="Generate hundreds of QR codes from a CSV or pasted list and download a ZIP of SVGs or a ready-to-print Avery label sheet PDF. Free and generated in your browser."
/>

<div class="mx-auto max-w-7xl px-4 py-12 sm:px-6">
	<p class="ticket reveal">Bulk · Label sheets</p>
	<h1 class="reveal reveal-2 mt-3 max-w-3xl">Hundreds of codes, one download.</h1>
	<p class="reveal reveal-3 mt-5 max-w-2xl text-lg text-ink-2">
		Paste a list or open a CSV, and every code is encoded, decode-tested, and packed into a ZIP or
		laid out on an Avery sheet. The spreadsheet stays on your machine; nothing here has a server to
		send it to.
	</p>

	<div class="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-8">
		<!-- ------------------------------------------------------------- input -->
		<section class="sheet grid gap-5 p-5 sm:p-6" aria-labelledby="input-heading">
			<SectionHeader title="The list" id="input-heading">
				{#snippet badge()}
				<div class="seg" role="group" aria-label="Where the list comes from">
					<button type="button" aria-pressed={source === 'paste'} onclick={() => (source = 'paste')}>
						Paste
					</button>
					<button type="button" aria-pressed={source === 'csv'} onclick={() => (source = 'csv')}>
						CSV file
					</button>
				</div>
				{/snippet}
			</SectionHeader>

			{#if source === 'paste'}
				<div class="field">
					<label for="lines">One payload per line</label>
					<textarea
						id="lines"
						class="textarea mono min-h-44"
						spellcheck="false"
						placeholder={'https://example.com/menu\tTable 1\nhttps://example.com/wifi\tGuest WiFi'}
						bind:value={pasted}
					></textarea>
					<p class="hint">
						An optional second column becomes the file name and the printed caption. Separate it with
						a tab, or with a comma if none of your lines contain a tab.
					</p>
				</div>
			{:else}
				<div class="field">
					<span class="label">CSV or TSV file</span>
					<DropTile
						accept=".csv,.tsv,.txt,text/csv"
						label="Drop a CSV here, or choose a file"
						hint="It is parsed in your browser. Nothing is uploaded."
						error={csvError}
						ariaLabel="Choose a CSV or TSV file"
						onfile={onCsvFile}
					/>
					{#if table}
						<p class="hint">
							<span class="num">{table.name}</span> · {table.rows.length} rows · {table.columns}
							{table.columns === 1 ? 'column' : 'columns'}
						</p>
					{/if}
				</div>
				{#if table}
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={hasHeader} /> The first row is a header
					</label>
					<div class="grid grid-cols-2 gap-3">
						<div class="field">
							<label for="pcol">Payload column</label>
							<select id="pcol" class="select" bind:value={payloadCol}>
								{#each choices as choice (choice.value)}
									<option value={choice.value}>{choice.text}</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<label for="lcol">Label column</label>
							<select id="lcol" class="select" bind:value={labelCol}>
								<option value={-1}>None</option>
								{#each choices as choice (choice.value)}
									<option value={choice.value}>{choice.text}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}
			{/if}

			<div class="flex flex-wrap items-center gap-3">
				<span class="badge badge-muted">{parsed.rows.length} {parsed.rows.length === 1 ? 'row' : 'rows'}</span>
				{#if parsed.dropped > 0}
					<span class="hint">
						{parsed.total} rows found. Only the first <span class="num">{MAX_ROWS}</span> are used;
						split the file and run it twice.
					</span>
				{/if}
			</div>

			{#if preview.length > 0}
				<div class="overflow-x-auto">
					<table class="prose-table w-full border-collapse text-sm">
						<thead>
							<tr>
								<th>#</th>
								<th>Label</th>
								<th>Encodes as</th>
							</tr>
						</thead>
						<tbody>
							{#each preview as row, i (i)}
								<tr>
									<td class="num border-b border-rule px-2 py-1.5 text-ink-3">{i + 1}</td>
									<td class="border-b border-rule px-2 py-1.5">{row.label || '—'}</td>
									<td class="num border-b border-rule px-2 py-1.5 break-all">
										{#if row.error}<span class="text-block">{row.error}</span>{:else}{row.encoded}{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if parsed.rows.length > preview.length}
					<p class="hint">First {preview.length} of {parsed.rows.length}.</p>
				{/if}
			{/if}
		</section>

		<!-- ----------------------------------------------------------- options -->
		<section class="sheet grid gap-5 p-5 sm:p-6" aria-labelledby="options-heading">
			<SectionHeader title="Encoding" id="options-heading" />

			<div class="field">
				<span class="label">Content type</span>
				<div class="seg" role="group" aria-label="Content type">
					<button type="button" aria-pressed={type === 'url'} onclick={() => (type = 'url')}>URL</button>
					<button type="button" aria-pressed={type === 'text'} onclick={() => (type = 'text')}>Text</button>
				</div>
				<p class="hint">
					{type === 'url'
						? 'https:// is added when a line does not have a scheme.'
						: 'Each line is encoded exactly as written.'}
					WiFi, contact cards and events are one at a time on the
					<a href="/">generator</a>.
				</p>
			</div>

			<div class="field">
				<span class="label">Error correction</span>
				<div class="seg" role="group" aria-label="Error correction">
					{#each eccs as level (level)}
						<button type="button" aria-pressed={ecc === level} onclick={() => (ecc = level)}>{level}</button>
					{/each}
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="field">
					<label for="quiet">Quiet zone</label>
					<input id="quiet" class="input num" type="number" min="0" max="10" step="1" bind:value={quiet} />
				</div>
				<div class="field">
					<label for="width">Width (mm)</label>
					<input id="width" class="input num" type="number" min="5" step="1" bind:value={width} />
				</div>
				<!-- The same control as the generator's: a validated hex field beside a swatch that opens
				     our own picker. The pair of native <input type=color> that stood here were the last on
				     the site, and their hex boxes bound straight to fg and bg, so a half-typed "#1f6" or a
				     pasted "1f6f63" reached the encoder, the decode check, and layoutLabels, all of which
				     fall back to black without saying so. A whole batch could come out black. -->
				<ColourField label="Ink" bind:value={fg} related={[bg]} />
				<ColourField label="Paper" bind:value={bg} related={[fg]} />
				<div class="field col-span-2">
					<label for="dpi">PNG resolution</label>
					<select id="dpi" class="select" bind:value={dpi}>
						<option value={150}>150 dpi (screen)</option>
						<option value={300}>300 dpi (print)</option>
						<option value={600}>600 dpi (fine print)</option>
					</select>
				</div>
			</div>

			<hr class="rule" />

			<div class="grid gap-3">
				{#if phase === 'idle'}
					<button
						type="button"
						class="btn btn-accent"
						disabled={parsed.rows.length === 0}
						onclick={generate}
					>
						{parsed.rows.length === 0
							? 'Generate'
							: `Generate ${parsed.rows.length} ${parsed.rows.length === 1 ? 'code' : 'codes'}`}
					</button>
				{:else}
					<div
						class="h-2 w-full overflow-hidden rounded-full border border-rule-2 bg-white"
						role="progressbar"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={pct}
						aria-label={phase === 'generating' ? 'Generating codes' : 'Building the ZIP'}
					>
						<div class="h-full bg-accent" style="width: {pct}%"></div>
					</div>
					<p class="hint num text-center">
						{phase === 'generating' ? 'Encoding and decode-testing' : `Writing ${zipFormat.toUpperCase()}s`}
						{done} / {goal}
					</p>
					<button type="button" class="btn btn-secondary btn-sm" onclick={cancel}>Cancel</button>
				{/if}
				{#if runError}
					<p class="notice notice-block">{runError}</p>
				{/if}
			</div>
		</section>
	</div>

	<!-- ------------------------------------------------------------- results -->
	{#if items}
		<!-- Bound outside the snippet: a snippet body does not inherit the {#if}'s narrowing. -->
		{@const total = items.length}
		<section class="sheet mt-6 grid gap-5 p-5 sm:p-6 lg:mt-8" aria-labelledby="results-heading">
			<SectionHeader title="Download" id="results-heading">
				{#snippet badge()}
					<span class="badge {unverified.length + rejected.length === 0 ? 'badge-ok' : 'badge-warn'}">
						{good.length} of {total} ready
					</span>
				{/snippet}
			</SectionHeader>

			<div class="grid gap-2">
				<p class="text-ink-2">
					<span class="num">{good.length}</span> codes generated in
					<span class="num">{(elapsed / 1000).toFixed(1)} s</span>{#if good.length}, versions
						<span class="num">{lowVersion}{lowVersion === highVersion ? '' : `–${highVersion}`}</span>{/if}.
					{#if good.length}
						At <span class="num">{widthMm} mm</span> the tightest code has
						<span class="num">{smallestModule.toFixed(2)} mm</span> modules.
					{/if}
				</p>
				{#if tooSmall}
					<p class="notice notice-warn">
						<Icon name="warning" size={15} />
						<span>Modules under {MODULE_MM_WARN} mm are below the floor phones read reliably. Shorten the
						content or print larger.</span>
					</p>
				{/if}
				{#if unverified.length > 0}
					<p class="notice notice-warn">
						<Icon name="warning" size={15} />
						<span>{unverified.length}
						{unverified.length === 1 ? 'code' : 'codes'} did not decode on this device:
						{unverified.length === 1 ? 'row' : 'rows'}
						<span class="num">{rowNumbers(unverified)}</span>. They are still in the ZIP, marked
						<code>false</code> in the manifest. The check uses the ink and paper colours above, so
						more contrast between them is the first thing to try; then scan them by hand before printing.</span>
					</p>
				{/if}
				{#if rejected.length > 0}
					<p class="notice notice-block">
						<Icon name="warning" size={15} />
						<span>{rejected.length}
						{rejected.length === 1 ? 'row' : 'rows'} could not be encoded and produced no file:
						{rejected.length === 1 ? 'row' : 'rows'}
						<span class="num">{rowNumbers(rejected)}</span>. First reason: {rejected[0]?.error}</span>
					</p>
				{/if}
				{#if remasked > 0}
					<p class="hint">
						{remasked}
						{remasked === 1 ? 'code was' : 'codes were'} re-encoded at a different mask pattern to
						pass the decode check. The content is unchanged.
					</p>
				{/if}
			</div>

			<hr class="rule" />

			<div class="grid gap-2 sm:grid-cols-2">
				<button
					type="button"
					class="btn btn-accent"
					disabled={phase !== 'idle' || good.length === 0}
					onclick={() => downloadZip('svg')}
				>
					ZIP of SVGs <span class="ticket text-paper/70">vector</span>
				</button>
				<button
					type="button"
					class="btn"
					disabled={phase !== 'idle' || good.length === 0}
					onclick={() => downloadZip('png')}
				>
					ZIP of PNGs <span class="ticket text-paper/70">{dpi} dpi</span>
				</button>
			</div>
			<p class="hint">
				Files are named <code>001-label.svg</code> in list order, with a
				<code>manifest.csv</code> of index, label, payload, version, and whether each one decoded.
				PNGs are slower than SVGs: a few hundred take several seconds to compress.
			</p>

			<hr class="rule" />

			<button type="button" class="ticket text-left underline" onclick={openLabels}>
				{labelsOpen ? 'Hide' : 'Show'} label sheet PDF
			</button>

			{#if labelsOpen}
				{#if sheetList.length === 0}
					<p class="hint">Loading the sheet geometry…</p>
				{:else}
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="field sm:col-span-2">
							<label for="sheet">Label sheet</label>
							<select id="sheet" class="select" bind:value={sheetId}>
								{#each sheetList as sheet (sheet.id)}
									<option value={sheet.id}>{sheet.name}</option>
								{/each}
							</select>
						</div>
						<div class="field">
							<label for="start">Start at label #</label>
							<input
								id="start"
								class="input num"
								type="number"
								min="1"
								max={perSheet || 1}
								step="1"
								bind:value={start}
							/>
						</div>
						<div class="field">
							<span class="label">Caption</span>
							<div class="seg" role="group" aria-label="Caption">
								<button type="button" aria-pressed={caption === 'label'} onclick={() => (caption = 'label')}>
									Label
								</button>
								<button type="button" aria-pressed={caption === 'none'} onclick={() => (caption = 'none')}>
									None
								</button>
							</div>
						</div>
					</div>
					<label class="flex items-center gap-2 text-sm">
						<input type="checkbox" bind:checked={outlines} /> Draw label outlines, for calibration
					</label>
					<p class="hint">
						{perSheet} labels a sheet · {good.length} codes from position
						<span class="num">{startAt + 1}</span> fill
						<span class="num">{pages}</span>
						{pages === 1 ? 'sheet' : 'sheets'}.
						{#if currentSheet}{currentSheet.page} paper, printed at 100% scale.{/if}
					</p>
					<div class="grid gap-2 sm:grid-cols-2">
						<button
							type="button"
							class="btn"
							disabled={!!pdfBusy || good.length === 0}
							onclick={labelPdf}
						>
							{pdfBusy === 'labels' ? 'Laying out…' : 'Download label sheet PDF'}
						</button>
						<button type="button" class="btn btn-secondary" disabled={!!pdfBusy} onclick={calibrationPdf}>
							{pdfBusy === 'calibration' ? 'Building…' : 'Print a calibration sheet'}
						</button>
					</div>
					<p class="hint">
						Print the calibration sheet on plain paper first and hold it against a real sheet of
						labels. Printer margins drift, and it is cheaper to find out on paper than on 300 labels.
					</p>
				{/if}
			{/if}

			<p class="text-center text-xs text-ink-3">{SITE.promise}</p>
		</section>
	{/if}
</div>

<section class="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
	<div class="prose">
		<h2>What the file should look like</h2>
		<p>
			One row per code. The first column is what the code will contain: a full web address, or a
			bare one like <code>example.com/menu</code>, which gets <code>https://</code> put in front of
			it. The second column is optional and is only ever printed or used as a file name, never
			encoded: a table number, a room, an asset tag, a guest's name. A CSV exported from any
			spreadsheet works, with or without a header row; you choose which column is which after the
			file is read. Pasting works the same way, with a tab between the two columns. Two thousand
			rows is the ceiling in one run.
		</p>
		<h3>Label sheets</h3>
		<p>
			Four sheets are laid out from measured geometry: Avery 5160 address labels, 5163 shipping
			labels, and 5395 name badges on US Letter, plus Avery L7160 on A4. Each code is printed in the
			colours and at the width set above, or as large as the label allows, with a 2 mm margin
			inside its die-cut and the caption beside it, and you can start partway down a part-used
			sheet. Print the calibration sheet first: it draws the label outlines and nothing
			else, so you can hold it up to a real sheet and catch a printer that scales to fit before you
			have wasted a pack of labels.
		</p>
		<h3>None of this leaves your machine</h3>
		<p>
			The CSV is read by your browser, encoded by a worker thread on your own processor, and zipped
			in the same tab. There is no upload, no queue, and no account, so a spreadsheet of customer
			URLs, staff names, or unreleased product links never reaches a server that could log it or
			leak it. Every code is also rasterised and decoded here before you download it, and anything
			that failed that check is named in the summary and flagged in the manifest.
			<a href="/never-expires">The codes cannot expire either.</a>
		</p>
	</div>
</section>
