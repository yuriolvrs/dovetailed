// What this file is: unit tests for coverLetterCitations.ts.
// In plain terms: tests proving each sentence of a letter is matched to the
// right evidence, flagged when it needs a check, or left as your own words.

import { describe, expect, it } from 'vitest';
import { carryCitations, citeParagraph } from './coverLetterCitations';
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

  it('flags a cited sentence the claim check rejected, and keeps supported ones cited', () => {
    const checked: SourceMapEntry[] = [
      { generatedText: 'I ran the spring fair.', atomIds: ['e1'], claim: true, supported: true },
      { generatedText: 'I managed the fair.', atomIds: ['e1'], claim: true, supported: false },
    ];
    const spans = citeParagraph('I ran the spring fair. I managed the fair.', checked, opts);
    expect(spans.filter((s) => s.status !== 'space').map((s) => s.status)).toEqual(['cited', 'flagged']);
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

describe('carryCitations', () => {
  const map: SourceMapEntry[] = [
    { generatedText: 'I ran the spring fair.', atomIds: ['e1'], claim: true },
    { generatedText: 'I wrote the newsletter.', atomIds: ['e2'], claim: true },
    { generatedText: 'Other paragraph.', atomIds: ['e3'], claim: true },
  ];

  it('carries the old sentences evidence onto the reworded paragraph', () => {
    const next = carryCitations(map, 'I ran the spring fair. I wrote the newsletter.', 'I ran the fair and wrote the newsletter.', opts);
    expect(next).toEqual([
      map[2],
      { generatedText: 'I ran the fair and wrote the newsletter.', atomIds: ['e1', 'e2'], claim: true },
    ]);
    expect(citeParagraph('I ran the fair and wrote the newsletter.', next, opts)[0].status).toBe('cited');
  });

  it('keeps a reworded paragraph flagged when it held an unsupported cited sentence', () => {
    const unsupported: SourceMapEntry[] = [{ generatedText: 'I managed the fair.', atomIds: ['e1'], claim: true, supported: false }];
    const next = carryCitations(unsupported, 'I managed the fair.', 'I handled the fair.', opts);
    expect(citeParagraph('I handled the fair.', next, opts)[0].status).toBe('flagged');
  });

  it('keeps a reworded paragraph flagged when it held an unbacked claim', () => {
    const flaggedMap: SourceMapEntry[] = [...map, { generatedText: 'I led ten people.', atomIds: [], claim: true }];
    const next = carryCitations(flaggedMap, 'I ran the spring fair. I led ten people.', 'I ran the fair and led ten people.', opts);
    expect(citeParagraph('I ran the fair and led ten people.', next, opts)[0].status).toBe('flagged');
  });
});
