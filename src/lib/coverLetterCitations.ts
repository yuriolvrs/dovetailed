// What this file is: splits one cover letter paragraph, as it reads now, into
// spans tied to the letter's sourceMap: sentences that cite profile lines,
// plain sentences that need none, claims with no evidence (flagged), and
// text the user wrote or changed (no longer the model's claim). Works with
// both sentence entries (current letters) and whole-paragraph entries
// (letters written before sentence citations).
// In plain terms: works out which parts of a paragraph are backed by your
// profile, which need checking, and which you wrote yourself.

import type { SourceMapEntry } from '../types';
import { isPlainClosing } from './generation/plainClosing';
import { normalizeLine } from './jobFit';

export type SpanStatus = 'cited' | 'plain' | 'flagged' | 'edited' | 'space';

export interface CitedSpan {
  start: number;
  end: number;
  text: string;
  status: SpanStatus;
  /** The sourceMap entry behind this span; null for edited text and spaces. */
  entry: SourceMapEntry | null;
}

/**
 * How one sourceMap entry reads in the editor.
 * In plain terms: is this sentence backed, harmless, or in need of a check.
 */
function statusOf(entry: SourceMapEntry, text: string, isLast: boolean, context: string): SpanStatus {
  if (entry.atomIds.length > 0) return 'cited';
  // A sentence the model marked as no claim still counts as one if it names
  // something the posting doesn't (an employer, a tool, a figure).
  if (entry.claim === false) return isPlainClosing(text, context) ? 'plain' : 'flagged';
  // Whole-paragraph entries from older letters: only the closing thank-you
  // gets a pass, as before.
  if (entry.claim === undefined && isLast && isPlainClosing(text, context)) return 'plain';
  return 'flagged';
}

/**
 * Splits `paragraph` into spans. Entries are found by exact text, left to
 * right without overlap; whatever no entry covers is the user's own text.
 * A whole-paragraph entry from an older letter also matches after small
 * edits (spacing, case, a full stop), as it always did.
 * In plain terms: lines up the paragraph's sentences with their evidence.
 */
export function citeParagraph(
  paragraph: string,
  sourceMap: SourceMapEntry[],
  options: { isLast: boolean; context: string },
): CitedSpan[] {
  const found: { start: number; end: number; entry: SourceMapEntry }[] = [];
  for (const entry of sourceMap) {
    const needle = entry.generatedText.trim();
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = paragraph.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      if (!found.some((f) => at < f.end && end > f.start)) {
        found.push({ start: at, end, entry });
        break;
      }
      from = at + 1;
    }
  }
  if (found.length === 0) {
    const whole = sourceMap.find((e) => normalizeLine(e.generatedText) === normalizeLine(paragraph));
    if (whole && paragraph.trim()) found.push({ start: 0, end: paragraph.length, entry: whole });
  }
  found.sort((a, b) => a.start - b.start);

  const spans: CitedSpan[] = [];
  let cursor = 0;
  const gap = (end: number) => {
    if (end <= cursor) return;
    const text = paragraph.slice(cursor, end);
    spans.push({ start: cursor, end, text, status: text.trim() ? 'edited' : 'space', entry: null });
  };
  for (const f of found) {
    gap(f.start);
    const text = paragraph.slice(f.start, f.end);
    spans.push({ ...f, text, status: statusOf(f.entry, text, options.isLast, options.context) });
    cursor = f.end;
  }
  gap(paragraph.length);
  return spans;
}

/**
 * The sourceMap after an AI rewording replaced `before` with `after`. The
 * rewording may only reuse what the paragraph already said (the filter in
 * suggestBulletRewrite.ts drops new names and figures), so the old
 * sentences' evidence carries over as one whole-paragraph entry. If any old
 * sentence was an unbacked claim, the new paragraph is flagged as a whole
 * rather than letting that claim hide under the others' evidence.
 * In plain terms: keeps a reworded paragraph's citations honest.
 */
export function carryCitations(
  sourceMap: SourceMapEntry[],
  before: string,
  after: string,
  options: { isLast: boolean; context: string },
): SourceMapEntry[] {
  const spans = citeParagraph(before, sourceMap, options);
  const used = new Set(spans.map((s) => s.entry).filter((e): e is SourceMapEntry => e !== null));
  const rest = sourceMap.filter((e) => !used.has(e));
  if (spans.some((s) => s.status === 'flagged')) {
    return [...rest, { generatedText: after, atomIds: [], claim: true }];
  }
  const atomIds = [...new Set(spans.flatMap((s) => (s.status === 'cited' && s.entry ? s.entry.atomIds : [])))];
  return [...rest, { generatedText: after, atomIds, claim: atomIds.length > 0 }];
}
