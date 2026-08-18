// What this file is: unit tests for splitTemplate.ts -- that a template is
// only ever cut at structural boundaries, that the pieces rejoin into the
// original, and that a small template still goes through as one piece.
// In plain terms: proves cutting a template into AI-sized pieces doesn't lose
// or mangle anything.

import { describe, expect, it } from 'vitest';
import { MAX_CHUNK_CHARS, splitTexIntoChunks } from './splitTemplate';
import { DEFAULT_RAW_TEX } from './defaultTemplate';

const filler = (n: number) => 'x'.repeat(n);

function bigTemplate(): string {
  return [
    `\\documentclass{article}\n${filler(3000)}\n`,
    `\\begin{document}\n${filler(3000)}\n`,
    `\\section{Experience}\n${filler(3000)}\n`,
    `\\section{Projects}\n${filler(3000)}\n\\end{document}\n`,
  ].join('');
}

describe('splitTexIntoChunks', () => {
  it('returns nothing for an empty template', () => {
    expect(splitTexIntoChunks('   \n  ')).toEqual([]);
  });

  it('keeps a template under the limit as a single chunk', () => {
    const tex = `\\documentclass{article}\n\\begin{document}\n\\section{Skills}\nhi\n\\end{document}`;
    expect(splitTexIntoChunks(tex)).toEqual([tex]);
  });

  it('rejoins to exactly the original template', () => {
    expect(splitTexIntoChunks(bigTemplate()).join('')).toBe(bigTemplate().trim());
    expect(splitTexIntoChunks(DEFAULT_RAW_TEX).join('')).toBe(DEFAULT_RAW_TEX.trim());
  });

  it('cuts only at \\begin{document} or a \\section', () => {
    const chunks = splitTexIntoChunks(bigTemplate());

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(1)) {
      expect(chunk).toMatch(/^(\\begin\{document\}|\\section)/);
    }
  });

  it('packs whole segments together rather than filling to the limit', () => {
    // Four ~3k segments, 5k limit: each chunk takes one segment, since adding
    // a second would overflow -- never half of the next one.
    const chunks = splitTexIntoChunks(bigTemplate());

    expect(chunks).toHaveLength(4);
    expect(chunks.every((c) => c.length <= MAX_CHUNK_CHARS)).toBe(true);
  });

  it('splits the bundled sample template into parts that each fit', () => {
    const chunks = splitTexIntoChunks(DEFAULT_RAW_TEX);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= MAX_CHUNK_CHARS)).toBe(true);
  });

  it('returns an oversized section whole rather than cutting inside it', () => {
    const huge = `\\begin{document}\n\\section{Experience}\n${filler(MAX_CHUNK_CHARS * 2)}\n`;
    const chunks = splitTexIntoChunks(huge);

    expect(chunks.some((c) => c.length > MAX_CHUNK_CHARS)).toBe(true);
    expect(chunks.join('')).toBe(huge.trim());
  });
});
