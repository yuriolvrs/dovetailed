// What this file is: runs the one-time raw-.tex -> placeholder-template
// conversion. Splits the template into request-sized chunks, converts each in
// turn through the proxy, and stitches the results back into one template.
// Kept out of the UI component so the chunk/merge logic is testable with the
// LLM mocked.
// In plain terms: turns your pasted LaTeX template into a fill-in-the-blanks
// one, a piece at a time if it's long.

import { generateStructured } from '../llm';
import {
  buildConvertLatexTemplatePrompt,
  CONVERSION_REASONING_EFFORT,
  estimateConversionMaxTokens,
  isLatexConversionResult,
  type LatexConversionResult,
} from '../../prompts/convertLatexTemplate';
import { repairBareCommandBraces } from './fillTemplate';
import { splitTexIntoChunks } from './splitTemplate';
import { validateTemplate } from './validateTemplate';

export interface ConvertProgress {
  /** 1-based index of the chunk being converted. */
  part: number;
  total: number;
}

/** A conversion result plus any problems validateTemplate still found in it. */
export interface ConvertedTemplate extends LatexConversionResult {
  problems: string[];
}

/**
 * Converts a whole template, chunk by chunk, then checks it with
 * validateTemplate. If the check finds problems, converts once more with the
 * problems added to the prompt. A result that still has problems is returned
 * with them, so the UI can show them instead of saving silently.
 * Chunks run sequentially rather than in parallel: the provider's cap is
 * tokens *per minute*, so firing them at once would just trip it -- llm.ts's
 * 429 backoff then paces the run, which is why this can take a while and
 * reports progress.
 * In plain terms: converts your template one piece at a time, tries again
 * once if the result is broken, and reports what is still wrong.
 */
export async function convertTemplate(
  rawTex: string,
  options: { onProgress?: (progress: ConvertProgress) => void; signal?: AbortSignal } = {},
): Promise<ConvertedTemplate> {
  const first = await convertChunks(rawTex, [], options);
  const firstProblems = validateTemplate(first.compiledTemplate);
  if (firstProblems.length === 0) return { ...first, problems: [] };

  const second = await convertChunks(rawTex, firstProblems, options);
  return { ...second, problems: validateTemplate(second.compiledTemplate) };
}

/**
 * One full pass over all chunks. `problems` (may be empty) are added to each
 * chunk's prompt on the retry.
 * In plain terms: one try at converting the whole template.
 */
async function convertChunks(
  rawTex: string,
  problems: string[],
  options: { onProgress?: (progress: ConvertProgress) => void; signal?: AbortSignal },
): Promise<LatexConversionResult> {
  const chunks = splitTexIntoChunks(rawTex);
  const compiled: string[] = [];
  const placeholders: string[] = [];

  for (const [i, chunk] of chunks.entries()) {
    options.onProgress?.({ part: i + 1, total: chunks.length });
    const prompt = buildConvertLatexTemplatePrompt(chunk, { index: i + 1, total: chunks.length }, problems);
    const result = await generateStructured(prompt, isLatexConversionResult, {
      maxTokens: estimateConversionMaxTokens(prompt, chunk),
      reasoningEffort: CONVERSION_REASONING_EFFORT,
      temperature: 0,
      signal: options.signal,
    });
    // Deterministic repair pass, not another LLM call -- see
    // repairBareCommandBraces's own comment for why this is needed.
    compiled.push(repairBareCommandBraces(result.compiledTemplate).trim());
    placeholders.push(...result.placeholders);
  }

  return {
    // Chunks were cut at section boundaries, so rejoining them with a blank
    // line reproduces the document's own top-level spacing.
    compiledTemplate: compiled.join('\n\n'),
    placeholders: [...new Set(placeholders)],
  };
}
