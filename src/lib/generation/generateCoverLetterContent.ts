// What this file is: orchestrates cover letter generation. Flow: (1) plan in code -- the 2-3 most
// important covered requirements, each with its best evidence line, one key gap to admit, and the
// Summary line (letterPlan.ts); (2) one LLM call that writes the letter sentence by sentence, with
// atomIds and requirementIds checked against what was offered; (3) tidy -- strip meta phrases and
// drop repeated sentences (letterChecks.ts); (4) claim check -- each cited sentence is verified
// against its evidence, a sentence naming the wrong employer fails, and failures are repaired with
// their whole paragraph in view (verifyClaims.ts); (5) tidy again, because a repair can bring back
// a banned phrase or a repeat. It also picks the evidence pool (confirmed matches first,
// additionalInfo next, rest of the profile as filler).
// In plain terms: decides what the letter should say, asks the AI to write it from your real
// accomplishments, then checks and cleans the result before you see it.

import type { CoverLetterContent, JobAnalysis, JobPosting, Profile, ProfileAtom, SourceMapEntry } from '../../types';
import { generateStructured, type GenerateOptions } from '../llm';
import {
  buildGenerateCoverLetterPrompt,
  isCoverLetterGeneration,
  MAX_CANDIDATES,
  plannedRequirementIds,
  type CoverLetterCandidate,
} from '../../prompts/generateCoverLetter';
import type { ClaimItem } from '../../prompts/verifyClaims';
import { stripAtomIdReferences } from './runHolisticSelection';
import { verifyClaimSentences } from './verifyClaims';
import { planCoverLetter } from './letterPlan';
import { cleanMetaPhrases, findDuplicateSentences, findWrongEmployer } from './letterChecks';

/**
 * Picks which profile atoms to offer the model as citable evidence:
 * confirmed requirement matches first, then additionalInfo, then the rest of
 * the profile's atoms as filler if there still isn't much to work with --
 * capped at MAX_CANDIDATES so the prompt stays a reasonable size.
 * In plain terms: chooses which real accomplishments to hand the AI to write
 * the letter from, most relevant first.
 */
export function selectEvidenceCandidates(analysis: JobAnalysis, atoms: ProfileAtom[]): ProfileAtom[] {
  const matchedIds = new Set(analysis.matches.flatMap((m) => m.atomIds));
  const matched = atoms.filter((a) => matchedIds.has(a.id));
  const additional = atoms.filter((a) => a.source === 'additional' && !matchedIds.has(a.id));
  const rest = atoms.filter((a) => !matchedIds.has(a.id) && a.source !== 'additional');

  const ordered = [...matched, ...additional, ...rest];
  const seen = new Set<string>();
  const deduped = ordered.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  return deduped.slice(0, MAX_CANDIDATES);
}

export interface GenerateCoverLetterOptions extends GenerateOptions {
  /** Whether to include a writing sample so the model mimics the candidate's tone. */
  useWritingStyle?: boolean;
  /**
   * The direct route's evidence pool, in place of the match-derived one.
   * Supplied by the holistic selection pass (runHolisticSelection.ts), which
   * has already chosen what to feature -- so on that route there is no
   * analysis, no requirement list, and nothing for selectEvidenceCandidates
   * to rank. Absent on the matched route, which behaves exactly as before.
   */
  holistic?: {
    atoms: ProfileAtom[];
    roleSummary: string;
  };
}

/**
 * Generates a tailored cover letter for a posting: picks evidence
 * candidates, calls the LLM once, and returns editable content plus a
 * sourceMap (one entry per sentence) the UI uses to flag any sentence that
 * makes a claim with no backing evidence.
 * In plain terms: writes a full cover letter for this job, grounded in your
 * real profile, ready to review and edit.
 */
export async function generateCoverLetterContent(
  profile: Profile,
  posting: JobPosting,
  atoms: ProfileAtom[],
  options: GenerateCoverLetterOptions = {},
): Promise<{ content: CoverLetterContent; sourceMap: SourceMapEntry[] }> {
  const analysis = posting.analysis;
  if (!analysis && !options.holistic) {
    throw new Error('This posting has no analysis to generate a cover letter from.');
  }

  // On the direct route the pass has already chosen the evidence and read the
  // role, so there is nothing to rank and no requirement list to send; the
  // prompt renders "(none listed)" for requirements on its own.
  const baseAtoms = options.holistic
    ? options.holistic.atoms.slice(0, MAX_CANDIDATES)
    : selectEvidenceCandidates(analysis!, atoms);
  const roleSummary = options.holistic ? options.holistic.roleSummary : analysis!.roleSummary;
  const requirements = options.holistic ? [] : analysis!.requirements.map((r) => r.text);

  // The plan is decided in code. Its evidence atoms are always offered to the model.
  const plan = planCoverLetter(options.holistic ? undefined : analysis, atoms);
  const known = new Map([...atoms, ...baseAtoms].map((a) => [a.id, a]));
  const pinned = [
    ...plan.requirements.map((r) => r.evidence.atomId),
    plan.gap?.evidence.atomId,
    plan.summaryAtomId,
  ]
    .map((id) => (id ? known.get(id) : undefined))
    .filter((a): a is ProfileAtom => a !== undefined);
  const seen = new Set<string>();
  const candidateAtoms = [...pinned, ...baseAtoms]
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .slice(0, MAX_CANDIDATES);
  const planIds = new Set([...plan.requirements.map((r) => r.id), ...(plan.gap ? [plan.gap.id] : [])]);

  const candidates: CoverLetterCandidate[] = candidateAtoms.map((a) => ({
    id: a.id,
    text: a.text,
    sourceLabel: a.sourceLabel,
  }));
  const candidateIds = new Set(candidateAtoms.map((a) => a.id));

  const styleSample =
    options.useWritingStyle ? profile.writingSamples.find((s) => s.trim() !== '') : undefined;

  const prompt = buildGenerateCoverLetterPrompt({
    candidateName: profile.contact.name,
    roleTitle: posting.title,
    company: posting.company,
    roleSummary,
    requirements,
    candidates,
    styleSample,
    plan,
  });

  const result = await generateStructured(prompt, isCoverLetterGeneration, {
    temperature: 0.3,
    // Generous headroom: openai/gpt-oss-120b is a reasoning model whose
    // chain-of-thought (billed separately as "reasoning" tokens, but still
    // deducted from max_tokens) can itself run past 1000 tokens for this
    // prompt -- confirmed live, a too-tight budget here cut the response off
    // mid-JSON (finish_reason "length") before any usable content came out,
    // surfacing to the user as "LLM proxy response had no content."
    // The per-sentence shape repeats text/claim/atomIds for every sentence,
    // so the answer itself is longer too; 3500 ran out live.
    maxTokens: 6000,
    // The plan is decided in code, so the model needs little thinking. At the
    // default effort 2 of 5 live runs failed twice with invalid JSON, most
    // likely cut off at the limit. maxTokens cannot grow: prompt plus
    // maxTokens must fit the provider's 8000 tokens-per-minute cap.
    reasoningEffort: 'low',
    signal: options.signal,
  });

  const atomsById = new Map(candidateAtoms.map((a) => [a.id, a]));
  let items: LetterItem[] = result.paragraphs.flatMap((paragraph, p) =>
    paragraph.sentences.map((sentence, s) => {
      // Ids the model wrote into its prose come out, as in interview prep.
      let text = normalizeHyphens(stripAtomIdReferences(sentence.text, candidateIds)).trim();
      // The greeting prints on its own line; drop it if the letter repeats it.
      if (p === 0 && s === 0) text = withoutRepeatedGreeting(result.greeting, [text])[0];
      const entry: SourceMapEntry = {
        generatedText: text,
        // Defensive: only trust ids that were actually offered, even though
        // the prompt already forbids inventing one.
        atomIds: sentence.atomIds.filter((id) => candidateIds.has(id)),
        claim: sentence.claim,
        requirementIds: plannedRequirementIds(sentence, planIds),
      };
      return { p, entry };
    }),
  );
  items = tidyItems(items);

  // Claim check: every claim sentence that cites lines is tested against those lines. A sentence
  // that names an employer its lines do not belong to fails first, whatever the model says.
  const wrongEmployerOf = (text: string, atomIds: string[]) =>
    findWrongEmployer(
      text,
      atomIds.map((id) => atomsById.get(id)?.sourceLabel ?? ''),
      profile,
      posting.company,
    );
  const paragraphText = (p: number) =>
    items.filter((i) => i.p === p).map((i) => i.entry.generatedText).join(' ');
  const toCheck: ClaimItem[] = [];
  items.forEach(({ p, entry }, index) => {
    const evidence = entry.atomIds.map((id) => atomsById.get(id)?.text ?? '').filter((t) => t !== '');
    if (entry.claim === false || entry.atomIds.length === 0 || evidence.length === 0) return;
    const wrong = wrongEmployerOf(entry.generatedText, entry.atomIds);
    if (wrong) entry.supported = false;
    toCheck.push({
      index,
      sentence: entry.generatedText,
      evidence,
      context: paragraphText(p),
      from: [...new Set(entry.atomIds.map((id) => atomsById.get(id)?.sourceLabel ?? '').filter((l) => l !== ''))],
      ...(wrong ? { forcedIssue: 'names the wrong employer' } : {}),
    });
  });
  for (const verdict of await verifyClaimSentences(toCheck, {
    signal: options.signal,
    // A repair must not name a wrong employer either.
    acceptRepair: (item, text) => !wrongEmployerOf(text, items[item.index].entry.atomIds),
  })) {
    const entry = items[verdict.index].entry;
    if (verdict.supported !== undefined) entry.supported = verdict.supported;
    entry.generatedText = normalizeHyphens(verdict.text);
  }
  // A repair can bring back a banned phrase or repeat another sentence.
  items = tidyItems(items);

  const paragraphs: string[] = [];
  for (const p of [...new Set(items.map((i) => i.p))]) paragraphs.push(paragraphText(p));

  const content: CoverLetterContent = {
    greeting: normalizeHyphens(result.greeting),
    paragraphs,
    closing: normalizeHyphens(result.closing),
  };

  return { content, sourceMap: items.map((i) => i.entry) };
}

/** One sentence of the letter with the paragraph it belongs to. */
interface LetterItem {
  p: number;
  entry: SourceMapEntry;
}

/**
 * Applies the deterministic text checks: removes meta phrases and stock openers or closers
 * (dropping a sentence that cannot be cleaned), then drops later copies of repeated sentences.
 * In plain terms: tidies the letter with fixed rules, no AI.
 */
function tidyItems(items: LetterItem[]): LetterItem[] {
  const cleaned: LetterItem[] = [];
  for (const item of items) {
    const text = cleanMetaPhrases(item.entry.generatedText);
    if (text === null) continue;
    item.entry.generatedText = text;
    cleaned.push(item);
  }
  const duplicates = findDuplicateSentences(cleaned.map((i) => i.entry.generatedText));
  return cleaned.filter((_, i) => !duplicates.has(i));
}

/**
 * Replaces the non-breaking and special hyphens (U+2010, U+2011, U+2012) with a plain "-".
 * In plain terms: swaps odd hyphen characters for the normal one.
 */
export function normalizeHyphens(text: string): string {
  return text.replace(/[‐‑‒]/g, '-');
}

/**
 * Removes the salutation from the start of the first paragraph when the
 * model repeated it there ("Dear Hiring Manager at BPI, I am eager..."). The
 * greeting already prints on its own line, so the letter otherwise opens
 * with it twice. The rest of the sentence is kept and capitalized.
 * In plain terms: stops the letter saying "Dear Hiring Manager" twice.
 */
export function withoutRepeatedGreeting(greeting: string, paragraphs: string[]): string[] {
  const salutation = greeting.trim().replace(/[,:;!.]+$/, '');
  if (!salutation || paragraphs.length === 0) return paragraphs;
  const first = paragraphs[0].trimStart();
  if (!first.toLowerCase().startsWith(salutation.toLowerCase())) return paragraphs;
  const rest = first.slice(salutation.length).replace(/^[\s,:;!.—-]+/, '');
  if (rest === '') return paragraphs;
  return [rest.charAt(0).toUpperCase() + rest.slice(1), ...paragraphs.slice(1)];
}
