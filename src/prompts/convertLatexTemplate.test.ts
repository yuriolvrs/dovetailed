// What this file is: unit tests for the LaTeX template conversion prompt
// builder and response validator.
// In plain terms: tests proving the "convert my LaTeX template" prompt is
// built correctly and we correctly recognize a good vs. bad AI reply.

import { describe, expect, it } from 'vitest';
import {
  buildConvertLatexTemplatePrompt,
  estimateConversionMaxTokens,
  estimateConversionPromptTokens,
  isLatexConversionResult,
  MAX_TEMPLATE_CHARS,
  TPM_BUDGET,
} from './convertLatexTemplate';
import { MAX_CHUNK_CHARS } from '../lib/latex/splitTemplate';

const validResult = {
  compiledTemplate: '\\name{{{name}}}{{#each experience}}{{title}}{{/each}}',
  placeholders: ['name', 'experience.title'],
};

describe('isLatexConversionResult', () => {
  it('accepts a fully-populated valid result', () => {
    expect(isLatexConversionResult(validResult)).toBe(true);
  });

  it('accepts a result with an empty placeholders list', () => {
    expect(isLatexConversionResult({ compiledTemplate: 'plain tex', placeholders: [] })).toBe(true);
  });

  it('rejects null, a string, and an array', () => {
    expect(isLatexConversionResult(null)).toBe(false);
    expect(isLatexConversionResult('nope')).toBe(false);
    expect(isLatexConversionResult([])).toBe(false);
  });

  it('rejects a missing or non-string compiledTemplate', () => {
    const { compiledTemplate: _omit, ...rest } = validResult;
    expect(isLatexConversionResult(rest)).toBe(false);
    expect(isLatexConversionResult({ ...validResult, compiledTemplate: 42 })).toBe(false);
  });

  it('rejects a non-array or non-string-element placeholders field', () => {
    expect(isLatexConversionResult({ ...validResult, placeholders: 'nope' })).toBe(false);
    expect(isLatexConversionResult({ ...validResult, placeholders: [1, 2] })).toBe(false);
  });
});

describe('buildConvertLatexTemplatePrompt', () => {
  it('includes the raw tex verbatim when under the length cap', () => {
    const prompt = buildConvertLatexTemplatePrompt('\\documentclass{article}');
    expect(prompt).toContain('\\documentclass{article}');
  });

  it('truncates raw tex beyond the length cap', () => {
    const long = 'x'.repeat(MAX_TEMPLATE_CHARS + 500);
    const prompt = buildConvertLatexTemplatePrompt(long);
    expect(prompt).toContain('[truncated]');
    // The run of "x"s itself must be capped, regardless of how much fixed
    // instruction text surrounds it.
    expect(prompt.match(/x{100,}/)?.[0].length).toBe(MAX_TEMPLATE_CHARS);
  });
});

describe('estimateConversionMaxTokens', () => {
  it('gives a longer prompt a smaller budget than a shorter one', () => {
    const short = estimateConversionMaxTokens('x'.repeat(500), 'x'.repeat(100));
    const long = estimateConversionMaxTokens('x'.repeat(8000), 'x'.repeat(4000));
    expect(long).toBeLessThan(short);
  });

  it('never goes below the floor even for a prompt at the length cap', () => {
    const atCap = estimateConversionMaxTokens(
      'x'.repeat(MAX_TEMPLATE_CHARS + 2000),
      'x'.repeat(MAX_TEMPLATE_CHARS),
    );
    expect(atCap).toBeGreaterThanOrEqual(2500);
  });

  it('over-counts rather than under-counts the one live measurement', () => {
    // Measured live against the real API: this exact prompt shape at 11,367
    // chars (of which ~7,067 were the .tex itself) reported prompt_tokens
    // 3112. The estimate exists to keep prompt + maxTokens under the cap, so
    // landing UNDER the real count is the one failure that matters -- that is
    // what got a request rejected outright (413) rather than merely running
    // tight.
    expect(estimateConversionPromptTokens('x'.repeat(11_367), 'x'.repeat(7_067))).toBeGreaterThan(
      3112,
    );
  });

  it('keeps prompt plus answer inside the per-minute cap at every chunk size', () => {
    // The whole point: the provider rejects the request when prompt tokens
    // and maxTokens together exceed the cap, so no input this app can build
    // may add up past it.
    for (let texChars = 0; texChars <= MAX_TEMPLATE_CHARS; texChars += 200) {
      const tex = 'x'.repeat(texChars);
      const prompt = buildConvertLatexTemplatePrompt(tex, { index: 1, total: 2 });
      const total =
        estimateConversionPromptTokens(prompt, tex) + estimateConversionMaxTokens(prompt, tex);
      expect(total).toBeLessThanOrEqual(TPM_BUDGET);
    }
  });

  it('leaves room for the model to reason and echo the chunk back', () => {
    // A cap that fits the request but starves the answer just swaps a 413 for
    // a truncated, unusable response. This model spends ~2800 tokens
    // reasoning before it writes any JSON, then has to echo the chunk back.
    const tex = 'x'.repeat(MAX_CHUNK_CHARS);
    const prompt = buildConvertLatexTemplatePrompt(tex, { index: 1, total: 2 });
    const needed = 2800 + Math.ceil(MAX_CHUNK_CHARS / 2.6);
    expect(estimateConversionMaxTokens(prompt, tex)).toBeGreaterThan(needed);
  });
});
