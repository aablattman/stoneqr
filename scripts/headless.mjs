/**
 * Drive one of the browser-backed scripts (`bun run og`, `bun run logo-fixtures`,
 * `bun run scan-sheets`) in headless Chrome instead of waiting for someone to open a tab.
 *
 *   bun run logo-fixtures --headless
 *   CHROME_PATH=/path/to/chrome bun run scan-sheets --headless
 *
 * Why Chrome and not a test runner: each of those scripts is a Bun server plus a page that does
 * its work where the code really runs (the DOM parser, canvas, the site's fonts) and POSTs the
 * result back. The only manual step was opening the URL, so this opens it. Nothing is added to
 * the repo for it: Chrome is already on a developer's machine and on GitHub's Ubuntu runners.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** True when the script was started with `--headless`. */
export function headlessRequested(argv = process.argv) {
	return argv.includes('--headless');
}

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ON_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

/**
 * The Chrome binary: `CHROME_PATH` if set, else the macOS app bundle, else the first of the usual
 * Linux names on PATH. Throws with the fix when none is found.
 */
export function findChrome(env = process.env) {
	if (env.CHROME_PATH) {
		if (existsSync(env.CHROME_PATH)) return env.CHROME_PATH;
		throw new Error(`CHROME_PATH is set to ${env.CHROME_PATH}, which does not exist.`);
	}
	if (existsSync(MAC_CHROME)) return MAC_CHROME;
	for (const name of ON_PATH) {
		const found = Bun.which(name);
		if (found) return found;
	}
	throw new Error(`No Chrome found. Install Google Chrome or Chromium, or set CHROME_PATH to the binary (on macOS: ${MAC_CHROME}).`);
}

/**
 * Open `url` in headless Chrome and wait for `done`, the promise the server resolves once the
 * page has posted its result. Rejects if Chrome exits first or `timeoutMs` passes, so the
 * caller's exit code stays honest. Chrome is killed and its throwaway profile removed either way.
 */
export async function runHeadless(url, done, { timeoutMs = 120_000 } = {}) {
	const chrome = findChrome();
	const profile = mkdtempSync(join(tmpdir(), 'stoneqr-chrome-'));
	console.log(`Driving ${url} in headless Chrome (${chrome})`);
	const proc = Bun.spawn(
		[
			chrome,
			'--headless=new',
			'--disable-gpu',
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-extensions',
			'--hide-scrollbars',
			`--user-data-dir=${profile}`,
			url
		],
		// Chrome is chatty on stderr (display-link noise on macOS); the page reports through the server.
		{ stdout: 'ignore', stderr: 'ignore' }
	);
	const crashed = proc.exited.then((code) => {
		throw new Error(`Chrome exited with code ${code} before the page finished.`);
	});
	crashed.catch(() => {}); // settled after a normal kill too; the race below still sees the rejection
	let timer;
	try {
		await Promise.race([
			done,
			crashed,
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(`The page did not finish within ${timeoutMs / 1000} s.`)), timeoutMs);
			})
		]);
	} finally {
		clearTimeout(timer);
		proc.kill();
		await proc.exited;
		rmSync(profile, { recursive: true, force: true });
	}
}

/**
 * How every script waits for its page: with `--headless` it drives Chrome and turns a failure into
 * a message and exit code 1; otherwise it prints `Open <url> <prompt>` and waits for a person.
 */
export async function awaitPage(url, done, { prompt, timeoutMs, headless = headlessRequested() }) {
	if (!headless) {
		console.log(`Open ${url} ${prompt}`);
		await done;
		return;
	}
	try {
		await runHeadless(url, done, { timeoutMs });
	} catch (e) {
		console.error(`✗ ${e instanceof Error ? e.message : e}`);
		process.exit(1);
	}
}
