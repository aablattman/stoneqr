import { describe, expect, it } from 'vitest';
import { Memo, fingerprint, keyOf } from '$lib/generator/memo';

describe('Memo', () => {
	it('returns what was set and nothing else', () => {
		const m = new Memo<number>(100);
		m.set('a', 1);
		expect(m.get('a')).toBe(1);
		expect(m.get('b')).toBeUndefined();
		expect(m.has('a')).toBe(true);
		expect(m.size).toBe(1);
	});

	it('evicts the least recently used entry when the count is exceeded', () => {
		const m = new Memo<number>(1000, 2);
		m.set('a', 1);
		m.set('b', 2);
		m.get('a'); // a is now younger than b
		m.set('c', 3);
		expect(m.has('b')).toBe(false);
		expect(m.get('a')).toBe(1);
		expect(m.get('c')).toBe(3);
	});

	it('evicts by weight, oldest first, until the budget holds', () => {
		const m = new Memo<string>(10);
		m.set('a', 'x', 4);
		m.set('b', 'y', 4);
		expect(m.weight).toBe(8);
		m.set('c', 'z', 4);
		expect(m.has('a')).toBe(false);
		expect(m.weight).toBe(8);
		m.set('d', 'w', 9);
		expect(m.size).toBe(1);
		expect(m.get('d')).toBe('w');
		expect(m.weight).toBe(9);
	});

	it('refuses a value heavier than the whole budget rather than emptying itself for it', () => {
		const m = new Memo<string>(10);
		m.set('a', 'x', 4);
		m.set('big', 'y', 11);
		expect(m.has('big')).toBe(false);
		expect(m.get('a')).toBe('x');
	});

	it('replaces an entry at its new weight', () => {
		const m = new Memo<string>(10);
		m.set('a', 'x', 4);
		m.set('a', 'y', 6);
		expect(m.size).toBe(1);
		expect(m.weight).toBe(6);
		expect(m.get('a')).toBe('y');
	});

	it('clears', () => {
		const m = new Memo<number>(10);
		m.set('a', 1, 3);
		m.clear();
		expect(m.size).toBe(0);
		expect(m.weight).toBe(0);
	});
});

describe('fingerprint', () => {
	it('is stable for equal strings and differs for unequal ones', () => {
		const svg = '<svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>';
		expect(fingerprint(svg)).toBe(fingerprint(svg.slice(0)));
		expect(fingerprint(svg)).not.toBe(fingerprint(svg.replace('1', '2')));
		expect(fingerprint('')).not.toBe(fingerprint(' '));
	});

	it('carries the length, so a change of size is never a collision', () => {
		expect(fingerprint('ab').endsWith('.2')).toBe(true);
		expect(fingerprint('abc').endsWith('.3')).toBe(true);
	});

	it('handles a long string the same whether or not it was seen before', () => {
		const long = 'data:image/png;base64,' + 'A'.repeat(100_000);
		const first = fingerprint(long);
		expect(fingerprint(long)).toBe(first); // from the remembered few
		expect(fingerprint(long + 'B')).not.toBe(first);
		expect(fingerprint('data:image/png;base64,' + 'A'.repeat(100_000))).toBe(first); // a fresh copy
	});

	it('tells single-character swaps apart across a long string', () => {
		const base = 'x'.repeat(50_000);
		const seen = new Set<string>();
		for (let i = 0; i < base.length; i += 997) seen.add(fingerprint(base.slice(0, i) + 'y' + base.slice(i + 1)));
		expect(seen.size).toBe(Math.ceil(base.length / 997));
	});
});

describe('keyOf', () => {
	it('keeps field order and drops undefined, so one literal is one key', () => {
		expect(keyOf({ k: 'plain', a: 1, b: undefined })).toBe(keyOf({ k: 'plain', a: 1 }));
		expect(keyOf({ k: 'plain', a: 1 })).not.toBe(keyOf({ k: 'plain', a: 2 }));
		expect(keyOf({ k: 'plain', a: [0, 0, 0] })).not.toBe(keyOf({ k: 'plain', a: [0, 0, 1] }));
	});
});
