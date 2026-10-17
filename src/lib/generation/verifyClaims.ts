// What this file is: runs the claim check on a list of sentences. It verifies them in one LLM call,
// optionally repairs the failures in a second call, and re-verifies the repairs.
// In plain terms: asks the AI to catch sentences that say more than the profile backs, and to
// fix them. If the check cannot run, the letter is left alone.

import { generateStructured, type GenerateOptions } from '../llm';
import {
  buildRepairClaimsPrompt,
  buildVerifyClaimsPrompt,
  isClaimRepairs,
  isClaimVerification,
  type ClaimItem,
} from '../../prompts/verifyClaims';

export interface VerifiedClaim {
  index: number;
  text: string;
  /** undefined means the check did not run. */
  supported: boolean | undefined;
}

export interface VerifyClaimOptions {
  /** Set false to skip the repair step (reword suggestions are dropped, not fixed). Default true. */
  repair?: boolean;
  signal?: GenerateOptions['signal'];
}

/** Runs one verify call. Returns index -> issue (null when supported), or null when the call failed. */
async function verify(
  items: ClaimItem[],
  signal: GenerateOptions['signal'],
): Promise<Map<number, string | null> | null> {
  try {
    const reply = await generateStructured(buildVerifyClaimsPrompt(items), isClaimVerification, {
      temperature: 0,
      maxTokens: 2000,
      reasoningEffort: 'low',
      signal,
    });
    if (!reply || !Array.isArray(reply.results)) return null;
    const verdicts = new Map<number, string | null>();
    for (const r of reply.results) verdicts.set(r.index, r.supported ? null : r.issue || 'goes beyond the evidence');
    // A sentence the model skipped is not checked, so it gets no verdict.
    return verdicts;
  } catch (e) {
    // Stop must still stop the build; any other failure just skips the check.
    if (signal?.aborted) throw e;
    return null;
  }
}

/**
 * Checks each sentence against its evidence lines. Unsupported sentences get one repair call and a
 * re-check. A repair is kept only if it now passes. If the first check fails to run, every item
 * comes back with `supported` undefined and its original text.
 * In plain terms: flags (and where possible fixes) sentences that claim more than your profile says.
 */
export async function verifyClaimSentences(
  items: ClaimItem[],
  options: VerifyClaimOptions = {},
): Promise<VerifiedClaim[]> {
  const results: VerifiedClaim[] = items.map((i) => ({ index: i.index, text: i.sentence, supported: undefined }));
  if (items.length === 0) return results;

  const verdicts = await verify(items, options.signal);
  if (!verdicts) return results;

  const failed: (ClaimItem & { issue: string })[] = [];
  for (const [n, item] of items.entries()) {
    if (!verdicts.has(item.index)) continue;
    const issue = verdicts.get(item.index);
    if (issue === null || issue === undefined) results[n].supported = true;
    else {
      results[n].supported = false;
      failed.push({ ...item, issue });
    }
  }
  if (failed.length === 0 || options.repair === false) return results;

  let repairs: Map<number, string>;
  try {
    const reply = await generateStructured(buildRepairClaimsPrompt(failed), isClaimRepairs, {
      temperature: 0,
      maxTokens: 2000,
      reasoningEffort: 'low',
      signal: options.signal,
    });
    repairs = new Map((reply?.repairs ?? []).map((r) => [r.index, r.text.trim()]));
  } catch (e) {
    if (options.signal?.aborted) throw e;
    return results;
  }

  const candidates = failed
    .filter((f) => repairs.has(f.index))
    .map((f) => ({ index: f.index, sentence: repairs.get(f.index)!, evidence: f.evidence }));
  if (candidates.length === 0) return results;

  const recheck = await verify(candidates, options.signal);
  if (!recheck) return results;
  for (const c of candidates) {
    if (recheck.get(c.index) === null) {
      const entry = results.find((r) => r.index === c.index)!;
      entry.text = c.sentence;
      entry.supported = true;
    }
  }
  return results;
}
