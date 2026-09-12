/**
 * The single design state object for the generator (plan §4: no global store beyond this).
 * Everything derives from it: payload string, encoded matrix, plain SVG, sizing assessment.
 */
import {
	encode,
	halftoneVersionFor,
	renderSvg,
	THRESHOLD_DEFAULT,
	assess,
	summary,
	moduleMm,
	toMm,
	LOGO_BLOCK_COVER,
	type Ecc,
	type EncodedQr,
	type HalftoneOptions,
	type LengthUnit,
	type RasterImage,
	type Warning
} from '@stoneqr/engine';
import { payloads, PayloadError, wifiWarnings, type PayloadType } from '@stoneqr/engine/payloads';
import type { CornerDotStyle, CornerSquareStyle, DotStyle, GradientKind } from '$lib/styled';
import { fitLogo, LOGO_WIDTH_DEFAULT, NO_LOGO } from '$lib/logo-size';
import { cropAspect, normaliseCrop } from '$lib/logo-crop';
import { LOOKS, lookFor, type LookId } from '$lib/looks';
import { weakestForeground } from './contrast';

export interface Fields {
	url: { url: string };
	text: { text: string };
	wifi: { ssid: string; password: string; auth: 'WPA' | 'WEP' | 'nopass'; hidden: boolean };
	vcard: VcardFields;
	mecard: VcardFields;
	email: { to: string; subject: string; body: string };
	sms: { to: string; body: string; scheme: 'sms' | 'smsto' };
	tel: { number: string };
	geo: { lat: string; lng: string; query: string };
	event: { summary: string; start: string; end: string; location: string; description: string; allDay: boolean };
}
export interface VcardFields {
	firstName: string;
	lastName: string;
	org: string;
	title: string;
	mobile: string;
	work: string;
	email: string;
	url: string;
	street: string;
	city: string;
	region: string;
	postal: string;
	country: string;
	note: string;
}

const emptyVcard = (): VcardFields => ({
	firstName: '', lastName: '', org: '', title: '', mobile: '', work: '', email: '', url: '',
	street: '', city: '', region: '', postal: '', country: '', note: ''
});

export function defaultFields(): Fields {
	const now = new Date();
	now.setMinutes(0, 0, 0);
	now.setHours(now.getHours() + 1);
	const toLocal = (d: Date) => {
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	};
	const end = new Date(now.getTime() + 60 * 60 * 1000);
	return {
		url: { url: '' },
		text: { text: '' },
		wifi: { ssid: '', password: '', auth: 'WPA', hidden: false },
		vcard: emptyVcard(),
		mecard: emptyVcard(),
		email: { to: '', subject: '', body: '' },
		sms: { to: '', body: '', scheme: 'sms' },
		tel: { number: '' },
		geo: { lat: '', lng: '', query: '' },
		event: { summary: '', start: toLocal(now), end: toLocal(end), location: '', description: '', allDay: false }
	};
}

export type VerifyState = 'idle' | 'checking' | 'ok' | 'fail';

export type HalftoneTone = 'colour' | 'grey' | 'silhouette';

export class Design {
	type = $state<PayloadType>('url');
	fields = $state<Fields>(defaultFields());

	// Encoding
	eccChoice = $state<Ecc>('M');
	minVersion = $state(1);
	mask = $state<number | 'auto'>('auto');
	quietZone = $state(4);

	// Physical size
	width = $state(50);
	unit = $state<LengthUnit>('mm');
	scanDistanceM = $state<number | null>(null);
	dpi = $state(300);

	// Style
	fg = $state('#000000');
	bg = $state('#ffffff');
	/**
	 * The three finder patterns' colour, or null to follow the code colour. Kept as an override
	 * rather than a copy so changing the code colour still moves the corners until someone
	 * deliberately picks a colour for them.
	 */
	cornerColor = $state<string | null>(null);
	transparentBg = $state(false);
	dot = $state<DotStyle>('square');
	cornerSquare = $state<CornerSquareStyle>('square');
	cornerDot = $state<CornerDotStyle>('square');
	gradient = $state<GradientKind>('none');
	gradientTo = $state('#1f6f63');
	gradientAngleDeg = $state(45);
	logo = $state<string | undefined>(undefined);
	logoName = $state('');
	/**
	 * How wide the logo should be, as a fraction of the code's width (quiet zone excluded). Only
	 * some widths are reachable, because a hole is a whole odd number of modules: `logoFit` says
	 * what was actually achieved and every readout and warning uses that, never this.
	 */
	logoWidth = $state(LOGO_WIDTH_DEFAULT);
	/** The picture's height divided by its width, measured from the file by the Preview. */
	logoAspect = $state(1);
	/**
	 * The part of the picture that goes in the code: left, top, width, and height as fractions
	 * of the picture, the whole picture by default. The blank space is cut to the crop's shape,
	 * so a wordmark cropped to its mark gets a square hole. Read through `logoCrop`, which
	 * repairs anything a design file may have put here.
	 */
	logoCropX = $state(0);
	logoCropY = $state(0);
	logoCropW = $state(1);
	logoCropH = $state(1);
	/** True cuts the modules out from under the logo; false paints it over them. */
	logoKnockout = $state(true);
	logoMargin = $state(1);
	frameEnabled = $state(false);
	frameText = $state('Scan me');
	frameColor = $state('#000000');
	frameTextColor = $state('#ffffff');

	// Artistic QR (halftone) mode, plan §7. Shown to users as "Artistic QR" (it was "Photo QR" until 2026-09-12); the code keeps the technique's name. The picture is decoded and rendered on the device.
	halftone = $state(false);
	halftoneImage = $state<string | undefined>(undefined);
	halftoneImageName = $state('');
	halftoneDotScale = $state(0.4);
	halftoneDim = $state(0);
	halftoneGrayscale = $state(false);
	halftoneContrast = $state(1);
	/**
	 * Silhouette: the picture reduced to ink and paper at `halftoneThreshold`, so a logo or a
	 * built-in shape comes out as crisp blocks rather than a soft photograph.
	 */
	halftoneSilhouette = $state(false);
	halftoneThreshold = $state(THRESHOLD_DEFAULT);
	/**
	 * The colour a silhouette's shape is filled with. Deliberately a plain colour with a default
	 * of its own and no link to `fg`: it briefly followed the code colour the way `cornerColor`
	 * does, which meant a code coloured as one end of a gradient handed that colour to the shape,
	 * while the Style panel sat disabled and the user could not take it back. Only the shape
	 * takes this; the dots and the function patterns are the code colour, so it cannot change
	 * what a scanner reads.
	 */
	shapeColor = $state('#000000');
	/** Picture zoom relative to cover-fit (1 fills the data area) and its position as a fraction of the area. */
	halftoneZoom = $state(1);
	halftoneOffsetX = $state(0);
	halftoneOffsetY = $state(0);
	/** The verified raster from the preview, reused by the export panel. */
	halftoneRaster = $state<RasterImage | null>(null);
	/**
	 * Object URL of the rendered Artistic QR preview. It lives on the design rather than inside the
	 * Preview component because the pinned phone bar shows the same thumbnail; Preview still owns
	 * creating and revoking it.
	 */
	halftonePreviewUrl = $state('');
	/** The option set that actually decoded, so exports re-render with the same settings. */
	halftoneOpts = $state<HalftoneOptions | null>(null);
	/** Plain-language note when the fallback ladder had to change something. */
	halftoneNote = $state('');

	// Dynamic hand-off
	shortUrl = $state<string | null>(null);

	/** True when the artistic renderer owns the preview; it takes precedence over the styled one. */
	halftoneActive = $derived(this.halftone && !!this.halftoneImage);

	/** How the picture is shown: in colour, in greys, or as a two-tone silhouette. One control, two flags. */
	get halftoneTone(): HalftoneTone {
		return this.halftoneSilhouette ? 'silhouette' : this.halftoneGrayscale ? 'grey' : 'colour';
	}
	set halftoneTone(tone: HalftoneTone) {
		this.halftoneSilhouette = tone === 'silhouette';
		this.halftoneGrayscale = tone === 'grey';
	}

	/**
	 * The style preset the three shapes add up to, or 'custom' when they were set by hand. One
	 * control, three fields, the same way halftoneTone works; nothing extra is stored.
	 */
	get look(): LookId | 'custom' {
		return lookFor(this.dot, this.cornerSquare, this.cornerDot)?.id ?? 'custom';
	}
	set look(id: LookId | 'custom') {
		const l = LOOKS.find((x) => x.id === id);
		if (!l) return;
		this.dot = l.dot;
		this.cornerSquare = l.cornerSquare;
		this.cornerDot = l.cornerDot;
	}

	/** The corners' effective colour: the override, else the code colour. Bindable from a colour field. */
	get cornerFg(): string {
		return this.cornerColor ?? this.fg;
	}
	set cornerFg(c: string) {
		this.cornerColor = c;
	}

	/** The background the renderers and the sizing rules see: the SVG renderer's word for none when transparent. */
	bgColor = $derived(this.transparentBg ? 'transparent' : this.bg);
	/**
	 * Whichever of the code colour and the corner colour reads worst against the background
	 * (white paper when transparent). Sizing and contrast checks look at this one, because a
	 * scanner that cannot find the finder patterns never gets as far as the data. The rule is
	 * `lib/generator/contrast.ts`, tested in `contrast.test.ts`.
	 */
	weakestFg = $derived(weakestForeground(this.fg, this.cornerColor, this.bgColor));

	/** Effective ECC: forced to H whenever a logo or a halftone picture is present. */
	ecc = $derived<Ecc>(this.logo || this.halftoneActive ? 'H' : this.eccChoice);
	widthMm = $derived(toMm(this.width, this.unit));
	/**
	 * The Advanced width field can be empty or nonsense mid-edit — clearing it to retype binds
	 * `undefined` — and a code with no width would export as a nought-pixel file that still passes
	 * the decode check, because verification rasterises at a fixed 8 px per module whatever the
	 * paper size. Downloads wait for a real width.
	 */
	widthValid = $derived(Number.isFinite(this.widthMm) && this.widthMm > 0);

	/** Style controls the user has touched, whether or not the styled renderer is in charge. */
	styleRequested = $derived(
		this.dot !== 'square' ||
			this.cornerSquare !== 'square' ||
			this.cornerDot !== 'square' ||
			this.cornerColor !== null ||
			this.gradient !== 'none' ||
			!!this.logo ||
			this.frameEnabled
	);
	/** True when anything beyond plain black squares is requested; then the lazy styled renderer is used. */
	styled = $derived(!this.halftoneActive && this.styleRequested);
	/** Halftone is on and would silently drop style choices; the panel says so. */
	halftoneOverridesStyle = $derived(this.halftoneActive && this.styleRequested);

	/**
	 * Settings only the Advanced controls expose, in plain words, so Basic mode can say they are
	 * still in force rather than silently applying them.
	 */
	advancedInUse = $derived.by((): string[] => {
		const out: string[] = [];
		if (this.halftoneActive) {
			if (this.halftoneDotScale !== 0.4) out.push('photo dot size');
			if (this.halftoneDim !== 0) out.push('photo fade');
			if (this.halftoneContrast !== 1) out.push('photo contrast');
		}
		if (this.transparentBg) out.push('transparent background');
		// Basic can set corner shapes through a look; only a hand-made combination is Advanced's alone.
		if (this.look === 'custom' && (this.cornerSquare !== 'square' || this.cornerDot !== 'square')) out.push('corner shapes');
		if (this.gradient !== 'none') out.push('gradient');
		if (this.scanDistanceM) out.push('scan distance');
		if (this.eccChoice !== 'M' && !this.logo && !this.halftoneActive) out.push(`error correction ${this.eccChoice}`);
		if (this.quietZone !== 4) out.push('quiet zone');
		if (this.minVersion !== 1) out.push('minimum version');
		if (this.mask !== 'auto') out.push('mask pattern');
		if (this.dpi !== 300) out.push('PNG resolution');
		return out;
	});

	payloadResult = $derived.by(() => buildPayload(this.type, this.fields, this.shortUrl));
	payload = $derived(this.payloadResult.payload);
	payloadError = $derived(this.payloadResult.error);
	payloadWarnings = $derived(this.payloadResult.warnings);
	isEmpty = $derived(this.payloadResult.empty);

	/** Halftone needs a big symbol for the picture to read (plan §7 step 1). */
	effectiveMinVersion = $derived(
		this.halftoneActive && this.payload ? halftoneVersionFor(this.payload) : this.minVersion
	);

	qr = $derived.by((): { qr: EncodedQr | null; error: string | null } => {
		if (!this.payload) return { qr: null, error: null };
		try {
			return {
				qr: encode(this.payload, { ecc: this.ecc, minVersion: this.effectiveMinVersion, mask: this.mask }),
				error: null
			};
		} catch (e) {
			return { qr: null, error: e instanceof Error ? e.message : String(e) };
		}
	});
	encoded = $derived(this.qr.qr);
	encodeError = $derived(this.qr.error);

	/** The library forces the margin to nought when the logo is painted over the modules. */
	effectiveLogoMargin = $derived(this.logoKnockout ? this.logoMargin : 0);
	/** The crop as a box that can be drawn, whatever the four fields hold. */
	logoCrop = $derived(normaliseCrop({ u: this.logoCropX, v: this.logoCropY, w: this.logoCropW, h: this.logoCropH }));
	/** The shape the hole is cut for: the cropped picture's, height over width. */
	logoHoleAspect = $derived(cropAspect(this.logoCrop, this.logoAspect));
	/**
	 * What the styled renderer will actually produce for this logo on this code: the coefficient
	 * to hand the library, the hole in modules, and the honest width, cover, and area figures.
	 * Recomputed whenever the content changes, because a longer URL means a denser code and a
	 * different staircase of reachable sizes.
	 */
	logoFit = $derived(
		this.logo && !this.halftoneActive && this.encoded
			? fitLogo(this.logoWidth, {
					modules: this.encoded.size,
					version: this.encoded.version,
					ecc: this.ecc,
					margin: this.effectiveLogoMargin,
					aspect: this.logoHoleAspect
				})
			: NO_LOGO
	);
	/** Modules the logo hides, as a fraction of what error correction can rebuild. */
	logoCover = $derived(this.logoFit.cover);

	plainSvg = $derived(
		this.encoded
			? renderSvg(this.encoded, {
					widthMm: this.widthMm,
					quietZone: this.quietZone,
					fg: this.fg,
					bg: this.bgColor,
					title: `QR code: ${describe(this.type)}`
				})
			: ''
	);

	moduleMm = $derived(this.encoded ? moduleMm(this.widthMm, this.encoded.size, this.quietZone) : 0);
	warnings = $derived<Warning[]>(
		this.encoded
			? [
					...assess({
						widthMm: this.widthMm,
						size: this.encoded.size,
						quiet: this.quietZone,
						fg: this.weakestFg,
						bg: this.bgColor,
						logoCover: this.logoCover,
						ecc: this.ecc,
						hasLogo: !!this.logo && !this.halftoneActive,
						scanDistanceM: this.scanDistanceM ?? undefined
					}),
					...this.payloadWarnings
				]
			: []
	);
	status = $derived(
		this.encoded
			? summary({
					widthMm: this.widthMm,
					size: this.encoded.size,
					quiet: this.quietZone,
					fg: this.weakestFg,
					bg: this.bgColor,
					logoCover: this.logoCover,
					ecc: this.ecc,
					hasLogo: !!this.logo && !this.halftoneActive,
					scanDistanceM: this.scanDistanceM ?? undefined
				})
			: 'blocked'
	);
	logoBlocked = $derived(this.logoCover > LOGO_BLOCK_COVER);

	// Verification is driven by the Preview component (it owns the debounce and the canvas).
	verify = $state<VerifyState>('idle');
	verifyDetail = $state('');

	/** Rendered styled SVG, kept here so the export panel can reuse the preview's render. */
	styledSvg = $state('');
	styledError = $state('');
	/** Artwork width over code width for the styled render: 1 without a frame. */
	styledScale = $state(1);

	reset(type: PayloadType) {
		this.type = type;
		this.shortUrl = null;
	}
}

export function describe(type: PayloadType): string {
	return (
		{
			url: 'link', text: 'text', wifi: 'WiFi network', vcard: 'contact card', mecard: 'contact card',
			email: 'email', sms: 'text message', tel: 'phone number', geo: 'location', event: 'calendar event'
		} as Record<PayloadType, string>
	)[type];
}

export interface PayloadResult {
	payload: string;
	error: string | null;
	warnings: Warning[];
	empty: boolean;
}

export function buildPayload(type: PayloadType, f: Fields, shortUrl: string | null): PayloadResult {
	const ok = (payload: string, warnings: Warning[] = []): PayloadResult => ({ payload, error: null, warnings, empty: false });
	const empty: PayloadResult = { payload: '', error: null, warnings: [], empty: true };
	if (shortUrl) return ok(shortUrl);
	try {
		switch (type) {
			case 'url':
				return f.url.url.trim() ? ok(payloads.url(f.url.url)) : empty;
			case 'text':
				return f.text.text.trim() ? ok(payloads.text(f.text.text)) : empty;
			case 'wifi': {
				const w = f.wifi;
				if (!w.ssid.trim()) return empty;
				return ok(
					payloads.wifi({ ssid: w.ssid, password: w.auth === 'nopass' ? undefined : w.password, auth: w.auth, hidden: w.hidden }),
					wifiWarnings({ ssid: w.ssid, password: w.auth === 'nopass' ? undefined : w.password, auth: w.auth, hidden: w.hidden })
				);
			}
			case 'vcard':
				return f.vcard.firstName.trim() || f.vcard.lastName.trim() ? ok(payloads.vcard(clean(f.vcard))) : empty;
			case 'mecard':
				return f.mecard.firstName.trim() || f.mecard.lastName.trim() ? ok(payloads.mecard(clean(f.mecard))) : empty;
			case 'email':
				return f.email.to.trim() ? ok(payloads.mailto({ to: f.email.to, subject: f.email.subject || undefined, body: f.email.body || undefined })) : empty;
			case 'sms':
				return f.sms.to.trim() ? ok(payloads.sms({ to: f.sms.to, body: f.sms.body || undefined, scheme: f.sms.scheme })) : empty;
			case 'tel':
				return f.tel.number.trim() ? ok(payloads.tel(f.tel.number)) : empty;
			case 'geo': {
				if (!f.geo.lat.trim() || !f.geo.lng.trim()) return empty;
				const lat = Number(f.geo.lat);
				const lng = Number(f.geo.lng);
				if (Number.isNaN(lat) || Number.isNaN(lng)) return { ...empty, empty: false, error: 'Latitude and longitude must be numbers.' };
				return ok(payloads.geo({ lat, lng, query: f.geo.query || undefined }));
			}
			case 'event': {
				const e = f.event;
				if (!e.summary.trim() || !e.start) return empty;
				// datetime-local strings are local time; all-day dates are read by the encoder as UTC
				// calendar dates, so build those from Date.UTC on the date part only.
				const parse = (s: string): Date | undefined => {
					if (!s) return undefined;
					if (e.allDay) {
						const [y, m, d] = s.slice(0, 10).split('-').map(Number);
						if (!y || !m || !d) return undefined;
						return new Date(Date.UTC(y, m - 1, d));
					}
					const dt = new Date(s);
					return Number.isNaN(dt.getTime()) ? undefined : dt;
				};
				const start = parse(e.start);
				if (!start) return { ...empty, empty: false, error: 'Start date is not valid.' };
				const end = parse(e.end);
				return ok(
					payloads.vevent({
						summary: e.summary,
						start,
						end,
						location: e.location || undefined,
						description: e.description || undefined,
						allDay: e.allDay
					}),
					[
						{
							level: 'info',
							code: 'event-support',
							message: 'Phone support for calendar QR codes varies. iPhone Camera and Google Lens offer to add the event; some Android cameras show the raw text. For a reliable experience, link to an event page instead.'
						}
					]
				);
			}
		}
	} catch (e) {
		if (e instanceof PayloadError) return { payload: '', error: e.message, warnings: [], empty: false };
		return { payload: '', error: e instanceof Error ? e.message : String(e), warnings: [], empty: false };
	}
	// Every known type returned above. `apply` refuses a type it does not know, so this is a
	// second fence rather than a live path: a design must never be left without a result.
	return empty;
}

function clean<T extends object>(o: T): Partial<T> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(o) as [string, unknown][]) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
	return out as Partial<T>;
}
