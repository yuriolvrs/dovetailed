// What this file is: orchestrates the two-step matching pass (cheap local
// retrieval, then a focused per-requirement LLM verification call) across
// every requirement in a job analysis, and the pure recalculation used when
// the user rejects a matched atom in the review UI.
// In plain terms: for each requirement, finds likely profile evidence, asks
// the AI to confirm it, and figures out what happens if the user says "no,
// that's not right" about a piece of evidence.

import type { ProfileAtom, Requirement, RequirementMatch } from '../../types';
import { retrieveCandidates } from './retrieval';
import { buildMatchRequirementPrompt, isMatchVerification, type MatchCandidate } from '../../prompts/matchRequirement';
import { generateStructured } from '../llm';

// How many verification calls are allowed in flight at once. Kept low
// (rather than higher) because several requirements' calls all sharing a
// single small tokens-per-minute budget (see llm.ts's 429 handling) means
// firing them in a bigger batch just makes them collide on the same cap
// together instead of spacing naturally.
const CONCURRENCY = 2;

// Education isn't eligible evidence for requirement matching -- a degree
// doesn't demonstrate a skill or requirement the way a skill/experience/
// project/additional-info atom does, and it's excluded from the manual
// evidence picker (EvidenceModal's SELECTABLE_SOURCES) for the same reason.
// Filtered here so automatic matching can't surface it either.
// In plain terms: leaves education entries out of automatic matching, since
// a degree isn't evidence for a specific skill.
function matchable(atoms: ProfileAtom[]): ProfileAtom[] {
  return atoms.filter((atom) => atom.source !== 'education');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const i = next++;
      results[i] = await fn(items[i]);
      onProgress?.(++done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function toCandidateList(candidates: { atom: ProfileAtom }[]): MatchCandidate[] {
  return candidates.map((c) => ({ id: c.atom.id, text: c.atom.text, sourceLabel: c.atom.sourceLabel }));
}

async function matchOneRequirement(
  requirement: Requirement,
  atoms: ProfileAtom[],
  signal?: AbortSignal,
): Promise<RequirementMatch> {
  const candidates = retrieveCandidates(requirement.text, matchable(atoms));
  if (candidates.length === 0) {
    return { requirementId: requirement.id, status: 'gap_no_candidates', atomIds: [] };
  }

  const candidateIds = new Set(candidates.map((c) => c.atom.id));
  const prompt = buildMatchRequirementPrompt(requirement.text, toCandidateList(candidates));
  const verification = await generateStructured(prompt, isMatchVerification, { temperature: 0.1, maxTokens: 300, signal });

  const confirmedIds = verification.atomIds.filter((id) => candidateIds.has(id));
  if (confirmedIds.length === 0) {
    return {
      requirementId: requirement.id,
      status: 'gap_unverified',
      atomIds: [],
      consideredAtomIds: candidates.map((c) => c.atom.id),
    };
  }

  return { requirementId: requirement.id, status: verification.status, atomIds: confirmedIds };
}

/**
 * Runs the full matching pass; verification calls run with limited
 * concurrency. `onProgress` (if given) fires after each requirement
 * finishes, so callers can show something better than an indefinite spinner
 * on a pass that's one LLM call per requirement. `signal` (if given) lets a
 * caller cancel an in-progress pass; a cancelled pass rejects with an
 * `AbortError` rather than returning partial results.
 *
 * In plain terms: checks every requirement against your profile, reports
 * progress as it goes, and can be stopped partway through.
 */
export async function runMatching(
  requirements: Requirement[],
  atoms: ProfileAtom[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<RequirementMatch[]> {
  return mapWithConcurrency(
    requirements,
    CONCURRENCY,
    (requirement) => matchOneRequirement(requirement, atoms, signal),
    onProgress,
    signal,
  );
}

/**
 * Recalculates a match after the user rejects one of its confirmed atoms.
 * Re-runs retrieval fresh (cheap/local/no LLM) rather than relying on a
 * persisted candidate list. If another above-floor candidate remains
 * (excluding the rejected atom and anything still confirmed), it's swapped
 * in and the existing status is kept; otherwise the requirement becomes
 * gap_unverified (candidates existed, none panned out).
 *
 * In plain terms: when you tell the app "no, that evidence doesn't count,"
 * this figures out what the match status should be instead.
 */
export function statusAfterReject(
  match: RequirementMatch,
  requirementText: string,
  atoms: ProfileAtom[],
  rejectedAtomId: string,
): RequirementMatch {
  const remainingConfirmed = match.atomIds.filter((id) => id !== rejectedAtomId);
  if (remainingConfirmed.length > 0) {
    return { ...match, atomIds: remainingConfirmed };
  }

  const candidates = retrieveCandidates(requirementText, matchable(atoms));
  const fallback = candidates.find((c) => c.atom.id !== rejectedAtomId);

  if (fallback) {
    return { ...match, atomIds: [fallback.atom.id] };
  }

  return {
    requirementId: match.requirementId,
    status: 'gap_unverified',
    atomIds: [],
    consideredAtomIds: candidates.filter((c) => c.atom.id !== rejectedAtomId).map((c) => c.atom.id),
  };
}
