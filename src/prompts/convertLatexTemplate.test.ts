// What this file is: unit tests for the LaTeX template conversion prompt
// builder and response validator.
// In plain terms: tests proving the "convert my LaTeX template" prompt is
// built correctly and we correctly recognize a good vs. bad AI reply.

import { describe, expect, it } from 'vitest';
import {
  buildConvertLatexTemplatePrompt,
  estimateConversionMaxTokens,
  isLatexConversionResult,
  MAX_TEMPLATE_CHARS,
} from './convertLatexTemplate';

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
    const short = estimateConversionMaxTokens('x'.repeat(500));
    const long = estimateConversionMaxTokens('x'.repeat(8000));
    expect(long).toBeLessThan(short);
  });

  it('never goes below the floor even for a prompt at the length cap', () => {
    const atCap = estimateConversionMaxTokens('x'.repeat(MAX_TEMPLATE_CHARS + 2000));
    expect(atCap).toBeGreaterThanOrEqual(2500);
  });

  it('matches the real measured value for the shipped default template prompt', () => {
    // Measured live against the real API for this exact prompt length
    // (11,367 chars): actual prompt_tokens was 3112, and 4700 completion
    // tokens completed cleanly (finish_reason "stop") -- this estimate
    // should land close to that.
    const estimate = estimateConversionMaxTokens('x'.repeat(11_367));
    expect(estimate).toBeGreaterThan(4000);
    expect(estimate).toBeLessThan(5500);
  });
});
