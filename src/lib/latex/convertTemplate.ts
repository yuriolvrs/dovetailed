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

export interface ConvertProgress {
  /** 1-based index of the chunk being converted. */
  part: number;
  total: number;
}

/**
 * Converts a whole template, chunk by chunk. Chunks run sequentially rather
 * than in parallel: the provider's cap is tokens *per minute*, so firing them
 * at once would just trip it -- llm.ts's 429 backoff then paces the run,
 * which is why this can take a while and reports progress.
 * In plain terms: converts your template one piece at a time, telling you
 * which piece it's on.
 */
export async function convertTemplate(
  rawTex: string,
  options: { onProgress?: (progress: ConvertProgress) => void; signal?: AbortSignal } = {},
): Promise<LatexConversionResult> {
  const chunks = splitTexIntoChunks(rawTex);
  const compiled: string[] = [];
  const placeholders: string[] = [];

  for (const [i, chunk] of chunks.entries()) {
    options.onProgress?.({ part: i + 1, total: chunks.length });
    const prompt = buildConvertLatexTemplatePrompt(chunk, { index: i + 1, total: chunks.length });
    const result = await generateStructured(prompt, isLatexConversionResult, {
      maxTokens: estimateConversionMaxTokens(prompt, chunk),
      reasoningEffort: CONVERSION_REASONING_EFFORT,
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
