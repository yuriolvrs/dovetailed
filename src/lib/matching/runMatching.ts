// What this file is: orchestrates the two-step matching pass (cheap local
// retrieval, then LLM verification of up to BATCH_SIZE requirements per
// call) across every requirement in a job analysis, and the pure
// recalculation used when
// the user rejects a matched atom in the review UI.
// In plain terms: for each requirement, finds likely profile evidence, asks
// the AI to confirm it, and figures out what happens if the user says "no,
// that's not right" about a piece of evidence.

import type { ProfileAtom, Requirement, RequirementMatch } from '../../types';
import { retrieveCandidates } from './retrieval';
import { matchDegree } from './degreeMatch';
import { SUMMARY_LABEL } from '../profileAtoms';
import {
  buildBatchMatchPrompt,
  buildGapLookPrompt,
  buildMatchRequirementPrompt,
  isBatchMatchVerification,
  isGapLookReply,
  isMatchVerification,
  type MatchCandidate,
  type MatchVerification,
} from '../../prompts/matchRequirement';
import { generateStructured } from '../llm';

// How many verification calls are allowed in flight at once. Kept low
// (rather than higher) because several requirements' calls all sharing a
// single small tokens-per-minute budget (see llm.ts's 429 handling) means
// firing them in a bigger batch just makes them collide on the same cap
// together instead of spacing naturally.
const CONCURRENCY = 2;

// Requirements checked per call. One call per requirement repeated the
// instructions and the model's warm-up reasoning every time; measured on two
// real postings, checking six or seven together used about half the tokens
// with the same results within the run-to-run noise of single calls. The
// free tier's daily token budget is what a busy day runs out of first.
const BATCH_SIZE = 6;

// Limits for the second-look call on gaps: how many gap requirements and how
// many profile lines one call carries.
const SECOND_LOOK_MAX_REQUIREMENTS = 12;
const SECOND_LOOK_MAX_LINES = 60;

// Education isn't eligible evidence for requirement matching -- a degree
// doesn't demonstrate a skill or requirement the way a skill/experience/
// project/additional-info atom does, and it's excluded from the manual
// evidence picker (EvidenceModal's SELECTABLE_SOURCES) for the same reason.
// Filtered here so automatic matching can't surface it either.
// In plain terms: leaves education entries out of automatic matching, since
// a degree isn't evidence for a specific skill.
function matchable(atoms: ProfileAtom[]): ProfileAtom[] {
  return atoms.filter((atom) => atom.source !== 'education' && atom.sourceLabel !== SUMMARY_LABEL);
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

interface Prepared {
  requirement: Requirement;
  candidates: { atom: ProfileAtom }[];
}

/**
 * Orders atom ids so experience and project bullets come before skills and
 * additional lines, keeping the model's order inside each group. The fit panel
 * and the letter show the first id as the covering line.
 * In plain terms: puts the job bullets ahead of bare skill tags.
 */
function strongestFirst(ids: string[], atoms: ProfileAtom[]): string[] {
  const bySource = new Map(atoms.map((a) => [a.id, a.source]));
  const isBullet = (id: string) => bySource.get(id) === 'experience' || bySource.get(id) === 'projects';
  return [...ids.filter(isBullet), ...ids.filter((id) => !isBullet(id))];
}

// Turns the model's answer for one requirement into a match, trusting only
// ids from that requirement's own candidate list.
function toMatch({ requirement, candidates }: Prepared, verification: MatchVerification): RequirementMatch {
  const candidateIds = new Set(candidates.map((c) => c.atom.id));
  const confirmedIds = strongestFirst(
    verification.atomIds.filter((id) => candidateIds.has(id)),
    candidates.map((c) => c.atom),
  );
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

async function verifyOne(item: Prepared, signal?: AbortSignal): Promise<RequirementMatch> {
  const prompt = buildMatchRequirementPrompt(item.requirement.text, toCandidateList(item.candidates));
  // 300 was enough for the previous model, but openai/gpt-oss-120b's own
  // chain-of-thought (billed as "reasoning" tokens, still deducted from
  // max_tokens) alone can exceed that -- confirmed live, it was cutting the
  // JSON off mid-response (finish_reason "length") before any usable content
  // came out.
  const verification = await generateStructured(prompt, isMatchVerification, { temperature: 0.1, maxTokens: 1200, signal });
  return toMatch(item, verification);
}

/**
 * Verifies several requirements in one call. A requirement the reply leaves
 * out is checked again on its own, so a short answer never turns into a
 * silent gap.
 * In plain terms: asks about a handful of requirements at once, and asks
 * again about any the AI skipped.
 */
async function verifyBatch(batch: Prepared[], signal?: AbortSignal): Promise<RequirementMatch[]> {
  if (batch.length === 1) return [await verifyOne(batch[0], signal)];

  const labelled = batch.map((item, i) => ({ item, label: `R${i + 1}` }));
  const prompt = buildBatchMatchPrompt(
    labelled.map(({ item, label }) => ({
      label,
      requirementText: item.requirement.text,
      candidates: toCandidateList(item.candidates),
    })),
  );
  const reply = await generateStructured(prompt, isBatchMatchVerification, {
    temperature: 0.1,
    // The single-call budget, plus room for each extra requirement's answer
    // and reasoning.
    maxTokens: 1200 + 300 * batch.length,
    signal,
  });

  return Promise.all(
    labelled.map(({ item, label }) => {
      const answer = reply.results.find((r) => r.requirement === label);
      return answer ? toMatch(item, answer) : verifyOne(item, signal);
    }),
  );
}

/**
 * One batched call that looks again at gap requirements against the user's
 * experience, project and additional lines (not only retrieved candidates).
 * Returns an upgraded match for each requirement the model supports, using
 * only line numbers from the offered list. Any failure returns nothing, so
 * the gaps stay; an aborted signal is rethrown.
 * In plain terms: asks the AI to search the whole profile again for
 * requirements that found nothing, and keeps the gaps if that fails.
 */
async function secondLook(gaps: Requirement[], lines: ProfileAtom[], signal?: AbortSignal): Promise<RequirementMatch[]> {
  const offered = gaps.slice(0, SECOND_LOOK_MAX_REQUIREMENTS);
  const offeredLines = lines.slice(0, SECOND_LOOK_MAX_LINES);
  const prompt = buildGapLookPrompt(
    offered.map((r, n) => ({ n, requirementText: r.text })),
    offeredLines.map((a, n) => ({ n, sourceLabel: a.sourceLabel, text: a.text })),
  );
  try {
    const reply = await generateStructured(prompt, isGapLookReply, {
      temperature: 0.1,
      // The reasoning model thinks before it answers; analysis ran out at a
      // tighter budget on a long posting.
      maxTokens: 2000 + 200 * offered.length,
      signal,
    });
    const upgraded = new Map<string, RequirementMatch>();
    for (const result of reply.results) {
      const requirement = offered[result.requirement];
      if (!requirement || upgraded.has(requirement.id)) continue;
      const ids = [...new Set(result.lines.map((n) => offeredLines[n]?.id).filter((id): id is string => !!id))];
      if (ids.length === 0) continue;
      upgraded.set(requirement.id, {
        requirementId: requirement.id,
        status: result.status,
        atomIds: strongestFirst(ids, offeredLines),
      });
    }
    return [...upgraded.values()];
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  }
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
  const pool = matchable(atoms);
  const byId = new Map<string, RequirementMatch>();

  // Degree requirements are decided by code (level ranking), with no call.
  const rest: Requirement[] = [];
  for (const requirement of requirements) {
    if (requirement.kind === 'education') byId.set(requirement.id, matchDegree(requirement, atoms));
    else rest.push(requirement);
  }
  const prepared = rest.map((requirement) => ({
    requirement,
    candidates: retrieveCandidates(requirement.text, pool),
  }));

  // Requirements with no candidates are gaps straight away, with no call.
  for (const { requirement, candidates } of prepared) {
    if (candidates.length === 0) {
      byId.set(requirement.id, { requirementId: requirement.id, status: 'gap_no_candidates', atomIds: [] });
    }
  }
  const toVerify = prepared.filter((p) => p.candidates.length > 0);
  const batches: Prepared[][] = [];
  for (let i = 0; i < toVerify.length; i += BATCH_SIZE) batches.push(toVerify.slice(i, i + BATCH_SIZE));

  // The second look reads experience, project and additional lines (no
  // skills, summary or education). With none, or nothing to match, it never runs.
  const lookLines = pool.filter((a) => a.source === 'experience' || a.source === 'projects' || a.source === 'additional');
  const secondLookPossible = lookLines.length > 0 && rest.length > 0;
  // Progress counts requirements, plus one step for the second look when it
  // may run, so the bar never stalls at the end or moves backwards.
  const total = requirements.length + (secondLookPossible ? 1 : 0);
  let done = byId.size;
  if (done > 0) onProgress?.(done, total);
  await mapWithConcurrency(
    batches,
    CONCURRENCY,
    async (batch) => {
      const matches = await verifyBatch(batch, signal);
      for (const match of matches) byId.set(match.requirementId, match);
      done += batch.length;
      onProgress?.(done, total);
    },
    undefined,
    signal,
  );

  if (secondLookPossible) {
    const gaps = rest.filter((r) => {
      const status = byId.get(r.id)?.status;
      return status === 'gap_no_candidates' || status === 'gap_unverified';
    });
    if (gaps.length > 0) {
      for (const match of await secondLook(gaps, lookLines, signal)) byId.set(match.requirementId, match);
    }
    onProgress?.(total, total);
  }

  return requirements.map((r) => byId.get(r.id)!);
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
