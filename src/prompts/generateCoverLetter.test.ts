// What this file is: unit tests for the cover letter prompt builder and
// response validator.
// In plain terms: tests proving the cover-letter prompt is built correctly
// and we correctly recognize a good vs. bad AI reply.

import { describe, expect, it } from 'vitest';
import { buildGenerateCoverLetterPrompt, isCoverLetterGeneration } from './generateCoverLetter';

const validResult = {
  greeting: 'Dear Hiring Manager,',
  paragraphs: ['I am excited to apply.', 'I bring relevant experience.'],
  closing: 'Sincerely,',
  sourceMap: [
    { generatedText: 'I am excited to apply.', atomIds: [] },
    { generatedText: 'I bring relevant experience.', atomIds: ['skills-abc123'] },
  ],
};

describe('buildGenerateCoverLetterPrompt', () => {
  it('includes the candidate name, role, company, requirements, and candidate evidence', () => {
    const prompt = buildGenerateCoverLetterPrompt({
      candidateName: 'Jane Doe',
      roleTitle: 'Software Engineer',
      company: 'Acme Co',
      roleSummary: 'Builds widgets.',
      requirements: ['3+ years React'],
      candidates: [{ id: 'skills-abc123', text: 'React', sourceLabel: 'Skills: Languages' }],
    });

    expect(prompt).toContain('Jane Doe');
    expect(prompt).toContain('Software Engineer');
    expect(prompt).toContain('Acme Co');
    expect(prompt).toContain('3+ years React');
    expect(prompt).toContain('skills-abc123');
    expect(prompt).toContain('React');
  });

  it('includes a style sample block only when one is provided', () => {
    const base = {
      candidateName: 'Jane Doe',
      roleSummary: 'Builds widgets.',
      requirements: [],
      candidates: [],
    };
    expect(buildGenerateCoverLetterPrompt(base)).not.toContain('WRITING STYLE SAMPLE');
    expect(buildGenerateCoverLetterPrompt({ ...base, styleSample: 'My own voice.' })).toContain(
      'WRITING STYLE SAMPLE',
    );
  });
});

describe('isCoverLetterGeneration', () => {
  it('accepts a fully-populated valid result', () => {
    expect(isCoverLetterGeneration(validResult)).toBe(true);
  });

  it('rejects null, a string, and an array', () => {
    expect(isCoverLetterGeneration(null)).toBe(false);
    expect(isCoverLetterGeneration('nope')).toBe(false);
    expect(isCoverLetterGeneration([])).toBe(false);
  });

  it('rejects an empty paragraphs list', () => {
    expect(isCoverLetterGeneration({ ...validResult, paragraphs: [] })).toBe(false);
  });

  it('rejects a paragraph that is blank', () => {
    expect(isCoverLetterGeneration({ ...validResult, paragraphs: ['  '] })).toBe(false);
  });

  it('rejects a sourceMap that merges multiple paragraphs into fewer entries than paragraphs.length', () => {
    expect(
      isCoverLetterGeneration({
        ...validResult,
        sourceMap: [{ generatedText: 'I am excited to apply. I bring relevant experience.', atomIds: [] }],
      }),
    ).toBe(false);
  });

  it('rejects a sourceMap entry missing atomIds or with a non-string generatedText', () => {
    expect(
      isCoverLetterGeneration({ ...validResult, sourceMap: [{ generatedText: 'x' }] }),
    ).toBe(false);
    expect(
      isCoverLetterGeneration({ ...validResult, sourceMap: [{ generatedText: 1, atomIds: [] }] }),
    ).toBe(false);
  });

  it('rejects a missing greeting or closing', () => {
    const { greeting: _omit, ...rest } = validResult;
    expect(isCoverLetterGeneration(rest)).toBe(false);
    expect(isCoverLetterGeneration({ ...validResult, closing: 42 })).toBe(false);
  });
});
