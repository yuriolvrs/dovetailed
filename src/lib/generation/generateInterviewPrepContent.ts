// What this file is: orchestrates one LLM call to generate likely interview
// questions -- reuses generateCoverLetterContent.ts's evidence-selection
// priority (confirmed matches first, additionalInfo next, rest of the
// profile as filler), builds the prompt, calls the LLM, and enforces that
// any atomIds it comes back with are actually ones it was offered (same
// defensive pattern generateCoverLetterContent.ts and runMatching.ts use).
// In plain terms: the code that picks your most relevant real accomplishments,
// asks the AI to write likely interview questions grounded in them, and
// double-checks it didn't cite anything it wasn't actually given.

import type { InterviewPrepContent, JobPosting, ProfileAtom, SourceMapEntry } from '../../types';
import { generateStructured, type GenerateOptions } from '../llm';
import {
  buildGenerateInterviewPrepPrompt,
  isInterviewPrepGeneration,
  type InterviewPrepCandidate,
} from '../../prompts/generateInterviewPrep';
import { selectEvidenceCandidates } from './generateCoverLetterContent';

/**
 * Generates likely interview questions for a posting: picks evidence
 * candidates the same way cover-letter generation does, calls the LLM once,
 * and returns editable content plus a sourceMap (one entry per question) the
 * UI uses to flag any question whose rationale makes a claim with no backing
 * evidence.
 * In plain terms: writes a set of likely interview questions for this job,
 * each grounded in your real profile where relevant, ready to review.
 */
export async function generateInterviewPrepContent(
  posting: JobPosting,
  atoms: ProfileAtom[],
  options: GenerateOptions = {},
): Promise<{ content: InterviewPrepContent; sourceMap: SourceMapEntry[] }> {
  const analysis = posting.analysis;
  if (!analysis) throw new Error('This posting has no analysis to generate interview prep from.');

  const candidateAtoms = selectEvidenceCandidates(analysis, atoms);
  const candidates: InterviewPrepCandidate[] = candidateAtoms.map((a) => ({
    id: a.id,
    text: a.text,
    sourceLabel: a.sourceLabel,
  }));
  const candidateIds = new Set(candidateAtoms.map((a) => a.id));

  const prompt = buildGenerateInterviewPrepPrompt({
    roleTitle: posting.title,
    company: posting.company,
    roleSummary: analysis.roleSummary,
    requirements: analysis.requirements.map((r) => r.text),
    candidates,
  });

  const result = await generateStructured(prompt, isInterviewPrepGeneration, {
    temperature: 0.5,
    // Same generous headroom as cover-letter generation -- 6-8 questions
    // plus rationales plus a matching sourceMap is a similarly sized reply.
    maxTokens: 3500,
    signal: options.signal,
  });

  // Defensive: only trust atomIds the model actually cites from what it was
  // offered, even though the prompt already forbids inventing one.
  const sourceMap: SourceMapEntry[] = result.sourceMap.map((entry) => ({
    generatedText: entry.generatedText,
    atomIds: entry.atomIds.filter((id) => candidateIds.has(id)),
  }));

  const content: InterviewPrepContent = { questions: result.questions };

  return { content, sourceMap };
}
