// What this file is: unit tests for coverLetterCitations.ts.
// In plain terms: tests proving each sentence of a letter is matched to the
// right evidence, flagged when it needs a check, or left as your own words.

import { describe, expect, it } from 'vitest';
import { citeParagraph } from './coverLetterCitations';
import type { SourceMapEntry } from '../types';

const context = 'Events Associate at Brightline. Jane Doe';
const opts = { isLast: false, context };

describe('citeParagraph', () => {
  const map: SourceMapEntry[] = [
    { generatedText: 'I am eager to join Brightline.', atomIds: [], claim: false },
    { generatedText: 'I ran the spring fair.', atomIds: ['e1'], claim: true },
    { generatedText: 'I also led a team of ten.', atomIds: [], claim: true },
  ];

  it('marks each sentence by its evidence', () => {
    const spans = citeParagraph('I am eager to join Brightline. I ran the spring fair. I also led a team of ten.', map, opts);
    expect(spans.filter((s) => s.status !== 'space').map((s) => [s.text, s.status])).toEqual([
      ['I am eager to join Brightline.', 'plain'],
      ['I ran the spring fair.', 'cited'],
      ['I also led a team of ten.', 'flagged'],
    ]);
  });

  it('treats changed or added text as the user\'s own', () => {
    const spans = citeParagraph('I am eager to join Brightline. I ran the big spring fair.', map, opts);
    expect(spans.map((s) => s.status)).toEqual(['plain', 'edited']);
  });

  it('flags a "no claim" sentence that names something the posting does not', () => {
    const spans = citeParagraph('I loved my time at Globex.', [{ generatedText: 'I loved my time at Globex.', atomIds: [], claim: false }], opts);
    expect(spans[0].status).toBe('flagged');
  });

  it('reads an older whole-paragraph entry, even after a small edit', () => {
    const old: SourceMapEntry[] = [{ generatedText: 'Thank you for your time. I look forward to talking.', atomIds: [] }];
    const last = citeParagraph('Thank you for your time.  I look forward to talking', old, { isLast: true, context });
    expect(last).toHaveLength(1);
    expect(last[0].status).toBe('plain');
    expect(citeParagraph('Thank you for your time. I look forward to talking.', old, opts)[0].status).toBe('flagged');
  });
});
