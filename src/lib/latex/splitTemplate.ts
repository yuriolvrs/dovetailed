// What this file is: splits a raw .tex resume template into chunks small
// enough to convert one at a time, since the whole template plus the model's
// echo of it back can't fit in a single request's token budget (see
// src/prompts/convertLatexTemplate.ts). Pure string work -- no LLM, no
// network -- so it's directly unit-testable.
// In plain terms: cuts a long LaTeX template into a few pieces that each fit
// in one AI request.

/**
 * Target size for one chunk. Sized against the per-request budget: this many
 * chars of LaTeX plus the prompt's own instructions estimates to ~2.5k prompt
 * tokens, leaving enough of the 8k tokens/minute cap for the model to echo
 * the chunk back as escaped JSON.
 */
export const MAX_CHUNK_CHARS = 5_000;

// Splits are only ever made where a top-level structure begins -- the
// preamble/document boundary and each \section. Cutting anywhere else risks
// separating repeated entries (the jobs under "Experience", say) that the
// conversion has to collapse into a single {{#each}} block: split across two
// chunks, each half would emit its own loop over the whole list and the
// filled resume would repeat every entry twice.
// In plain terms: we only ever cut between sections, never inside one, so a
// repeating block never gets torn in half.
const SPLIT_POINTS = /^[ \t]*(?:\\begin\{document\}|\\section\*?\s*\{)/gm;

function splitIntoSegments(tex: string): string[] {
  const cuts = [...tex.matchAll(SPLIT_POINTS)].map((m) => m.index).filter((i) => i > 0);
  const bounds = [0, ...cuts, tex.length];
  return bounds.slice(0, -1).map((start, i) => tex.slice(start, bounds[i + 1]));
}

/**
 * Cuts a template into chunks of at most MAX_CHUNK_CHARS, packing as many
 * whole segments into each chunk as fit. A template already under the limit
 * comes back as a single chunk, so the common small-template case is still
 * one request. A single segment larger than the limit is returned whole and
 * over-size rather than cut mid-section -- the caller warns about that
 * instead of silently producing a broken conversion.
 * In plain terms: groups the template's sections into as few AI-sized pieces
 * as possible.
 */
export function splitTexIntoChunks(rawTex: string): string[] {
  const tex = rawTex.trim();
  if (tex === '') return [];
  if (tex.length <= MAX_CHUNK_CHARS) return [tex];

  const chunks: string[] = [];
  for (const segment of splitIntoSegments(tex)) {
    const last = chunks.at(-1);
    if (last !== undefined && last.length + segment.length <= MAX_CHUNK_CHARS) {
      chunks[chunks.length - 1] = last + segment;
    } else {
      chunks.push(segment);
    }
  }
  return chunks;
}
