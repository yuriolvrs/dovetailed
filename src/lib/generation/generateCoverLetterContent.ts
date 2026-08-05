// What this file is: orchestrates one LLM call to write a tailored cover
// letter -- picks which real profile atoms to offer the model as evidence
// (same "confirmed matches first, additionalInfo next, rest of the profile
// as filler" priority selectResumeContent.ts uses for its own evidence
// pool), builds the prompt, calls the LLM, and enforces that any atomIds it
// comes back with are actually ones it was offered (an extra safety net on
// top of the prompt's own instruction not to invent ids, same defensive
// pattern runMatching.ts uses for matchRequirement.ts's response).
// In plain terms: the code that picks your most relevant real accomplishments,
// asks the AI to write a cover letter grounded in them, and double-checks it
// didn't cite anything it wasn't actually given.

import type { CoverLetterContent, JobAnalysis, JobPosting, Profile, ProfileAtom, SourceMapEntry } from '../../types';
import { generateStructured, type GenerateOptions } from '../llm';
import {
  buildGenerateCoverLetterPrompt,
  isCoverLetterGeneration,
  MAX_CANDIDATES,
  type CoverLetterCandidate,
} from '../../prompts/generateCoverLetter';

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
}

/**
 * Generates a tailored cover letter for a posting: picks evidence
 * candidates, calls the LLM once, and returns editable content plus a
 * sourceMap (one entry per paragraph) the UI uses to flag any paragraph that
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
  if (!analysis) throw new Error('This posting has no analysis to generate a cover letter from.');

  const candidateAtoms = selectEvidenceCandidates(analysis, atoms);
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
    roleSummary: analysis.roleSummary,
    requirements: analysis.requirements.map((r) => r.text),
    candidates,
    styleSample,
  });

  const result = await generateStructured(prompt, isCoverLetterGeneration, {
    temperature: 0.5,
    // Generous headroom: openai/gpt-oss-120b is a reasoning model whose
    // chain-of-thought (billed separately as "reasoning" tokens, but still
    // deducted from max_tokens) can itself run past 1000 tokens for this
    // prompt -- confirmed live, a too-tight budget here cut the response off
    // mid-JSON (finish_reason "length") before any usable content came out,
    // surfacing to the user as "LLM proxy response had no content."
    maxTokens: 3500,
    signal: options.signal,
  });

  // Defensive: only trust atomIds the model actually cites from what it was
  // offered, even though the prompt already forbids inventing one.
  const sourceMap: SourceMapEntry[] = result.sourceMap.map((entry) => ({
    generatedText: entry.generatedText,
    atomIds: entry.atomIds.filter((id) => candidateIds.has(id)),
  }));

  const content: CoverLetterContent = {
    greeting: result.greeting,
    paragraphs: result.paragraphs,
    closing: result.closing,
  };

  return { content, sourceMap };
}
