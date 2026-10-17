// What this file is: the opt-in "suggest a summary for this job" request. It
// asks the model for up to two drafts, then runs each through the claim check
// (no repair) with the cited profile lines as the only evidence. A draft the
// check marks unsupported is dropped. If the check could not run, drafts are
// kept, as with reworded bullets.
// In plain terms: gets a couple of summary ideas for this job and throws away
// any that say more than your profile does.

import { generateStructured } from '../llm';
import { buildSuggestSummaryPrompt, isSummarySuggestions } from '../../prompts/suggestSummary';
import { verifyClaimSentences } from './verifyClaims';

/**
 * Drafts up to two summaries. `lines` are the profile lines (the profile
 * summary, then the lines matched to the job's top requirements) that serve
 * as both the model's facts and the check's evidence.
 * In plain terms: one AI call plus a fact check, giving safe summary options.
 */
export async function requestSummarySuggestions(role: string, lines: string[]): Promise<string[]> {
  if (lines.length === 0) return [];
  const result = await generateStructured(buildSuggestSummaryPrompt(role, lines), isSummarySuggestions, {
    temperature: 0.4,
    maxTokens: 900,
  });
  const drafts = result.suggestions.map((s) => s.trim()).filter(Boolean);
  if (drafts.length === 0) return [];
  const checked = await verifyClaimSentences(
    drafts.map((sentence, index) => ({ index, sentence, evidence: lines })),
    { repair: false },
  );
  return drafts.filter((_, i) => checked.find((c) => c.index === i)?.supported !== false);
}
