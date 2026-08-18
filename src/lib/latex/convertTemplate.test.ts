// What this file is: unit tests for convertTemplate.ts with the LLM mocked
// (CLAUDE.md) -- that a split template becomes one request per chunk, that
// the pieces are stitched back in order, and that progress is reported.
// In plain terms: proves converting a long template piece by piece produces
// one coherent template at the end.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertTemplate, type ConvertProgress } from './convertTemplate';
import { MAX_CHUNK_CHARS } from './splitTemplate';
import { generateStructured } from '../llm';

vi.mock('../llm', () => ({ generateStructured: vi.fn() }));

const mockGenerate = vi.mocked(generateStructured);

function twoSectionTemplate(): string {
  const filler = 'x'.repeat(MAX_CHUNK_CHARS - 100);
  return `\\begin{document}\n\\section{Experience}\n${filler}\n\\section{Projects}\n${filler}\n`;
}

beforeEach(() => {
  mockGenerate.mockReset();
});

describe('convertTemplate', () => {
  it('makes one request for a template that fits in one', async () => {
    mockGenerate.mockResolvedValue({ compiledTemplate: '{{name}}', placeholders: ['name'] });

    const result = await convertTemplate('\\begin{document}\\name{Jane}\\end{document}');

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ compiledTemplate: '{{name}}', placeholders: ['name'] });
  });

  it('converts each chunk and joins the parts in order', async () => {
    mockGenerate
      .mockResolvedValueOnce({ compiledTemplate: 'FIRST', placeholders: ['name'] })
      .mockResolvedValueOnce({ compiledTemplate: 'SECOND', placeholders: ['projects.name'] });

    const result = await convertTemplate(twoSectionTemplate());

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.compiledTemplate).toBe('FIRST\n\nSECOND');
    expect(result.placeholders).toEqual(['name', 'projects.name']);
  });

  it('tells each request which part it is, so it answers with a fragment', async () => {
    mockGenerate.mockResolvedValue({ compiledTemplate: 'x', placeholders: [] });

    await convertTemplate(twoSectionTemplate());

    expect(mockGenerate.mock.calls[0][0]).toContain('THIS IS PART 1 OF 2');
    expect(mockGenerate.mock.calls[1][0]).toContain('THIS IS PART 2 OF 2');
  });

  it('reports progress once per chunk', async () => {
    mockGenerate.mockResolvedValue({ compiledTemplate: 'x', placeholders: [] });
    const seen: ConvertProgress[] = [];

    await convertTemplate(twoSectionTemplate(), { onProgress: (p) => seen.push(p) });

    expect(seen).toEqual([
      { part: 1, total: 2 },
      { part: 2, total: 2 },
    ]);
  });

  it('does not repeat a placeholder two chunks both used', async () => {
    mockGenerate.mockResolvedValue({ compiledTemplate: 'x', placeholders: ['name', 'email'] });

    const result = await convertTemplate(twoSectionTemplate());

    expect(result.placeholders).toEqual(['name', 'email']);
  });

  it('stops at the first failing chunk instead of stitching a partial template', async () => {
    mockGenerate
      .mockResolvedValueOnce({ compiledTemplate: 'FIRST', placeholders: [] })
      .mockRejectedValueOnce(new Error('proxy blew up'));

    await expect(convertTemplate(twoSectionTemplate())).rejects.toThrow('proxy blew up');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });
});
