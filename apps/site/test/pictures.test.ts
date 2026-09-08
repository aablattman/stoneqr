import { describe, expect, it } from 'vitest';
import { PICTURE_RULES, dataUrlBytes, dataUrlProblem, dataUrlType, pictureFileProblem } from '$lib/generator/pictures';

const MB = 1024 * 1024;
const file = (name: string, type: string, size: number) => ({ name, type, size });

describe('picture rules', () => {
	it('hold the tiles to the documented types and sizes', () => {
		expect(pictureFileProblem('logo', file('mark.png', 'image/png', 100_000))).toBeNull();
		expect(pictureFileProblem('logo', file('mark.svg', '', 5_000))).toBeNull();
		expect(pictureFileProblem('logo', file('mark.gif', 'image/gif', 5_000))).toBe(PICTURE_RULES.logo.wrongType);
		expect(pictureFileProblem('logo', file('mark.png', 'image/png', 2 * MB + 1))).toBe(PICTURE_RULES.logo.tooBig);
		expect(pictureFileProblem('halftone', file('face.jpg', 'image/jpeg', 7 * MB))).toBeNull();
		expect(pictureFileProblem('halftone', file('mark.svg', 'image/svg+xml', 5_000))).toBe(PICTURE_RULES.halftone.wrongType);
		expect(pictureFileProblem('halftone', file('face.jpg', 'image/jpeg', 8 * MB + 1))).toBe(PICTURE_RULES.halftone.tooBig);
	});

	it('measure a data URL by what it decodes to', () => {
		expect(dataUrlType('data:image/PNG;base64,AAAA')).toBe('image/png');
		expect(dataUrlType('data:image/svg+xml;charset=utf-8,<svg/>')).toBe('image/svg+xml');
		expect(dataUrlType('javascript:alert(1)')).toBe('');
		expect(dataUrlBytes('data:image/png;base64,' + 'A'.repeat(4000))).toBe(3000);
		expect(dataUrlBytes('data:image/svg+xml;charset=utf-8,' + 'x'.repeat(50))).toBe(50);
	});

	it('apply the same limits to a picture from a design file', () => {
		expect(dataUrlProblem('logo', 'data:image/webp;base64,AAAA')).toBeNull();
		expect(dataUrlProblem('logo', 'data:image/tiff;base64,AAAA')).toBe(PICTURE_RULES.logo.wrongType);
		expect(dataUrlProblem('logo', 'javascript:alert(1)')).toBe(PICTURE_RULES.logo.wrongType);
		// 2 MB of base64 is 8/3 million characters; one more block tips it over.
		const big = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((2 * MB * 4) / 3) + 4);
		expect(dataUrlProblem('logo', big)).toBe(PICTURE_RULES.logo.tooBig);
		expect(dataUrlProblem('halftone', big)).toBeNull();
		expect(dataUrlProblem('halftone', 'data:image/svg+xml;base64,AAAA')).toBe(PICTURE_RULES.halftone.wrongType);
	});
});
