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
  const groupNotes = result.groupNotes.filter((n) => keptLabels.has(n.sourceLabel));

  return {
    createdAt: Date.now(),
    atomIds,
    roleSummary: result.roleSummary,
    overallRationale: result.overallRationale,
    groupNotes,
  };
}
