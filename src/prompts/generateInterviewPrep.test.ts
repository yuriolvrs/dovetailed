// What this file is: unit tests for the interview-prep prompt builder and
// response validator.
// In plain terms: tests proving the interview-prep prompt is built correctly
// and we correctly recognize a good vs. bad AI reply.

import { describe, expect, it } from 'vitest';
import { buildGenerateInterviewPrepPrompt, isInterviewPrepGeneration } from './generateInterviewPrep';

const validResult = {
  questions: [
    { question: 'Tell me about a time you led a project.', rationale: 'Probes leadership experience.' },
    { question: 'How do you approach debugging a production issue?', rationale: 'Directly tied to the React requirement.' },
  ],
  sourceMap: [
    { generatedText: 'Tell me about a time you led a project.', atomIds: ['experience-abc123'] },
    { generatedText: 'How do you approach debugging a production issue?', atomIds: [] },
  ],
};

describe('buildGenerateInterviewPrepPrompt', () => {
  it('includes the role, company, requirements, and candidate evidence', () => {
    const prompt = buildGenerateInterviewPrepPrompt({
      roleTitle: 'Software Engineer',
      company: 'Acme Co',
      roleSummary: 'Builds widgets.',
      requirements: ['3+ years React'],
      candidates: [{ id: 'skills-abc123', text: 'React', sourceLabel: 'Skills: Languages' }],
    });

    expect(prompt).toContain('Software Engineer');
    expect(prompt).toContain('Acme Co');
    expect(prompt).toContain('3+ years React');
    expect(prompt).toContain('skills-abc123');
    expect(prompt).toContain('React');
  });
});

describe('isInterviewPrepGeneration', () => {
  it('accepts a fully-populated valid result', () => {
    expect(isInterviewPrepGeneration(validResult)).toBe(true);
  });

  it('rejects null, a string, and an array', () => {
    expect(isInterviewPrepGeneration(null)).toBe(false);
    expect(isInterviewPrepGeneration('nope')).toBe(false);
    expect(isInterviewPrepGeneration([])).toBe(false);
  });

  it('rejects an empty questions list', () => {
    expect(isInterviewPrepGeneration({ ...validResult, questions: [] })).toBe(false);
  });

  it('rejects a question that is blank', () => {
    expect(
      isInterviewPrepGeneration({ ...validResult, questions: [{ question: '  ', rationale: 'x' }] }),
    ).toBe(false);
  });

  it('rejects a question missing a rationale', () => {
    expect(
      isInterviewPrepGeneration({ ...validResult, questions: [{ question: 'x' }] }),
    ).toBe(false);
  });

  it('rejects a sourceMap that has fewer entries than questions', () => {
    expect(
      isInterviewPrepGeneration({ ...validResult, sourceMap: [validResult.sourceMap[0]] }),
    ).toBe(false);
  });

  it('rejects a sourceMap entry missing atomIds or with a non-string generatedText', () => {
    expect(isInterviewPrepGeneration({ ...validResult, sourceMap: [{ generatedText: 'x' }, validResult.sourceMap[1]] })).toBe(
      false,
    );
    expect(
      isInterviewPrepGeneration({ ...validResult, sourceMap: [{ generatedText: 1, atomIds: [] }, validResult.sourceMap[1]] }),
    ).toBe(false);
  });
});
