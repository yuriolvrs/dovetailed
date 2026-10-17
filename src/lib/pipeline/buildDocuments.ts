// What this file is: the one-pass "Build" pipeline. It reads a posting, matches
// it to the profile, builds the resume and writes the cover letter, saving
// each result as it finishes. Reading and matching are skipped when the posting
// already has them, so a retry does not repeat those AI calls. The resume (no AI
// call) is rebuilt each run; the cover letter is written each run.
// In plain terms: the code behind the single Build button. It runs every step
// for you, one after the other.

import type { JobPosting, Profile } from '../../types';
import { buildAnalyzePostingPrompt, isExtractedAnalysis, toJobAnalysis } from '../../prompts/analyzePosting';
import { EmptyResponseError, ProxyRequestError, generateStructured } from '../llm';
import { JsonParseError } from '../json';
import { fillPostingDetails, saveJobPosting } from '../jobStore';
import { buildProfileAtoms } from '../profileAtoms';
import { runMatching } from '../matching/runMatching';
import { newGeneration, saveGeneration } from '../genStore';
import { selectResumeContent } from '../generation/selectResumeContent';
import { fitToOnePage } from '../generation/fitToOnePage';
import { generateCoverLetterContent } from '../generation/generateCoverLetterContent';

export type PipelineStep = 'read' | 'match' | 'resume' | 'coverLetter';

export const PIPELINE_STEPS: PipelineStep[] = ['read', 'match', 'resume', 'coverLetter'];

export interface PipelineProgress {
  step: PipelineStep;
  /** Set during the match step: requirements checked so far and in total. */
  done?: number;
  total?: number;
}

export interface PipelineOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PipelineProgress) => void;
  /** Called after a step finishes, with the posting as saved so far. */
  onStepDone?: (step: PipelineStep, posting: JobPosting) => void;
}

/**
 * True for failures that often pass on a second try: a broken or empty model
 * answer, a proxy server error, or a dropped connection. Never true for a stop.
 * In plain terms: decides if a failed AI step is worth one more automatic try.
 */
function isRetryable(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) return false;
  if (err instanceof JsonParseError || err instanceof EmptyResponseError) return true;
  if (err instanceof ProxyRequestError) return err.status >= 500;
  return err instanceof TypeError && /fetch|network|load failed/i.test(err.message);
}

/**
 * Runs an AI step, and runs it once more if the first try fails in a way
 * isRetryable accepts. The second failure is thrown as it is.
 * In plain terms: gives a step one automatic second chance.
 */
async function withOneRetry<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isRetryable(err, signal)) throw err;
    return run();
  }
}

/**
 * Runs the four steps in order and returns the posting with its analysis and
 * matches filled in. Throws on the first failure. Work that finished before
 * the failure is already saved, so calling this again resumes there.
 * In plain terms: does everything from "posting pasted" to "both documents
 * ready", and picks up where it stopped if something goes wrong.
 */
export async function buildDocuments(
  initial: JobPosting,
  profile: Profile,
  options: PipelineOptions = {},
): Promise<JobPosting> {
  const { signal, onProgress, onStepDone } = options;
  let posting = initial;

  // Step 1: read the posting into a requirement list.
  if (!posting.analysis) {
    onProgress?.({ step: 'read' });
    const extracted = await withOneRetry(
      () =>
        generateStructured(buildAnalyzePostingPrompt(posting.rawText), isExtractedAnalysis, {
          temperature: 0.2,
          // Up to 20 requirements plus the reasoning model's own thinking; 2500
          // ran out on a long hospital posting.
          maxTokens: 4000,
          signal,
        }),
      signal,
    );
    posting = { ...fillPostingDetails(posting, extracted), analysis: toJobAnalysis(extracted) };
    await saveJobPosting(posting);
  }
  onStepDone?.('read', posting);

  const atoms = buildProfileAtoms(profile);

  // Step 2: match every requirement against the profile.
  if (posting.analysis!.matches.length === 0 && posting.analysis!.requirements.length > 0) {
    // One more than the requirement count: matching may add a final "second
    // look" step, and a total that only grows keeps the bar from moving back.
    onProgress?.({ step: 'match', done: 0, total: posting.analysis!.requirements.length + 1 });
    const matches = await runMatching(
      posting.analysis!.requirements,
      atoms,
      (done, total) => onProgress?.({ step: 'match', done, total }),
      signal,
    );
    posting = { ...posting, analysis: { ...posting.analysis!, matches, matchesEdited: false } };
    await saveJobPosting(posting);
  }
  onStepDone?.('match', posting);

  // Step 3: build the resume from the matches. No LLM call.
  onProgress?.({ step: 'resume' });
  const selected = selectResumeContent(profile, posting.analysis!, atoms);
  const { content, removedExperience, fits } = await fitToOnePage(selected.content, selected.sourceMap, signal);
  await saveGeneration({
    ...newGeneration(posting.id, 'resume', content, selected.sourceMap, 'matched'),
    removedForPageFit: removedExperience,
    pageFitOverflow: !fits,
    builtContent: content,
  });
  onStepDone?.('resume', posting);

  // Step 4: write the cover letter from the same matches.
  onProgress?.({ step: 'coverLetter' });
  const letter = await withOneRetry(
    () =>
      generateCoverLetterContent(profile, posting, atoms, {
        useWritingStyle: profile.writingSamples.some((s) => s.trim() !== ''),
        signal,
      }),
    signal,
  );
  await saveGeneration(newGeneration(posting.id, 'coverLetter', letter.content, letter.sourceMap, 'matched'));
  onStepDone?.('coverLetter', posting);

  return posting;
}
