// What this file is: runs the direct-selection pass -- one LLM call that
// reads a whole posting plus the whole profile and returns which profile
// atoms to feature, with the model's reasoning. The alternate route to the
// matched pipeline (src/lib/matching/runMatching.ts), which instead makes one
// call per extracted requirement. Same defensive contract as that file: ids
// the model returns are filtered against the ones it was actually offered, so
// an invented id is dropped rather than rendered.
// In plain terms: asks the AI once to read the job ad and pick the relevant
// parts of your profile, then double-checks it only pointed at things that
// really exist.

import type { HolisticSelection, JobPosting, ProfileAtom } from '../../types';
import { generateStructured, type GenerateOptions } from '../llm';
import {
  buildSelectProfileHolisticPrompt,
  estimateSelectionMaxTokens,
  isHolisticSelectionResult,
  MAX_ATOMS,
  type HolisticCandidate,
} from '../../prompts/selectProfileHolistic';

/**
 * Removes evidence ids the model wrote into its prose. The prompt forbids
 * them, but the first live run against the real model produced a rationale
 * littered with "(skills-1kxy8cf)" and "(experience-4b2, experience-9cd)" --
 * reference numbers that mean nothing to the reader, because the review screen
 * lists the evidence under its own headings and never shows an id. Stripped
 * here rather than trusted to the instruction, the same way atomIds themselves
 * are filtered rather than trusted.
 *
 * Removes a bracketed group whose whole content is ids and separators, then any
 * id left loose in a sentence, then tidies the spacing that leaves behind.
 * In plain terms: deletes the AI's internal reference codes from the
 * explanation it writes for you.
 */
export function stripAtomIdReferences(text: string, ids: Set<string>): string {
  // Only ids shaped like real ones. buildProfileAtoms always emits
  // `${source}-${hash}`, so requiring the hyphen costs nothing in production
  // and stops a short id from eating an ordinary word out of the prose -- a
  // test atom keyed 'real' had "Led with the real one" cut to "Led with the
  // one" before this guard existed.
  const strippable = [...ids].filter((id) => id.includes('-'));
  if (strippable.length === 0) return text;
  const idPattern = strippable.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const bracketed = new RegExp(`\\s*[([]\\s*(?:${idPattern})(?:\\s*[,;and]+\\s*(?:${idPattern}))*\\s*[)\\]]`, 'g');
  const bare = new RegExp(`\\b(?:${idPattern})\\b`, 'g');

  return text
    .replace(bracketed, '')
    .replace(bare, '')
    // An id removed mid-sentence can leave a doubled separator or a space
    // pushed up against punctuation.
    .replace(/\(\s*[,;]*\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;])\s*([,.;:])/g, '$2')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Which atoms to offer the model. Education is included here, unlike in
 * requirement matching (see runMatching.ts's `matchable`): that exclusion
 * exists because a degree is not evidence for a specific skill, but this
 * route is choosing what to feature on a document rather than satisfying a
 * named requirement, and a posting asking for a specific degree is a case it
 * should be able to see. Capped at MAX_ATOMS, keeping profile order.
 * In plain terms: picks which pieces of your profile the AI gets to look at.
 */
export function selectHolisticCandidates(atoms: ProfileAtom[]): ProfileAtom[] {
  return atoms.slice(0, MAX_ATOMS);
}

/**
 * Runs one direct-selection pass over a posting and returns the stored shape,
 * ready to save onto the posting. Every returned atom id is checked against
 * the offered set, and the ids are re-ordered to the model's stated
 * preference; group notes referring to a sourceLabel that no surviving atom
 * carries are dropped, so the review screen can never show a note about
 * evidence that isn't there.
 * In plain terms: does the one AI call for the direct route and cleans up its
 * answer before we keep it.
 */
export async function runHolisticSelection(
  posting: JobPosting,
  atoms: ProfileAtom[],
  options: GenerateOptions = {},
): Promise<HolisticSelection> {
  const candidateAtoms = selectHolisticCandidates(atoms);
  const candidates: HolisticCandidate[] = candidateAtoms.map((a) => ({
    id: a.id,
    text: a.text,
    sourceLabel: a.sourceLabel,
  }));
  const offeredIds = new Set(candidateAtoms.map((a) => a.id));

  const prompt = buildSelectProfileHolisticPrompt({
    postingText: posting.rawText,
    roleTitle: posting.title,
    company: posting.company,
    candidates,
  });

  const result = await generateStructured(prompt, isHolisticSelectionResult, {
    temperature: 0.2,
    // Sized from the prompt rather than fixed, because the provider caps
    // prompt + completion TOGETHER and rejects the request outright when the
    // pair exceeds it. A fixed number cannot satisfy both ends here: this is
    // the app's largest prompt, so anything generous enough for a short
    // posting overruns the cap on a long one. See estimateSelectionMaxTokens.
    maxTokens: estimateSelectionMaxTokens(prompt),
    // Chain-of-thought is billed against that same answer budget, and this
    // call reasons over a whole posting and a whole profile -- the shape most
    // at risk of spending the budget thinking and returning nothing
    // (finish_reason "length" -> EmptyResponseError). 'low' buys it back.
    reasoningEffort: 'low',
    signal: options.signal,
  });

  // Defensive: trust only ids the model was actually offered, even though the
  // prompt forbids inventing one. Deduped, because a model that repeats an id
  // would otherwise double-weight that atom downstream.
  const seen = new Set<string>();
  const atomIds = result.atomIds.filter(
    (id) => offeredIds.has(id) && !seen.has(id) && (seen.add(id), true),
  );

  const keptLabels = new Set(
    candidateAtoms.filter((a) => seen.has(a.id)).map((a) => a.sourceLabel),
  );
  // Every id the model was shown, not just the ones it kept -- it cites the
  // ones it rejected too, and those read as reference numbers just the same.
  const groupNotes = result.groupNotes
    .filter((n) => keptLabels.has(n.sourceLabel))
    .map((n) => ({ sourceLabel: n.sourceLabel, note: stripAtomIdReferences(n.note, offeredIds) }));

  return {
    createdAt: Date.now(),
    atomIds,
    roleSummary: result.roleSummary,
    overallRationale: stripAtomIdReferences(result.overallRationale, offeredIds),
    groupNotes,
  };
}
