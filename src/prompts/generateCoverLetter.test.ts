// What this file is: unit tests for the cover letter prompt builder and
// response validator.
// In plain terms: tests proving the cover-letter prompt is built correctly
// and we correctly recognize a good vs. bad AI reply.

import { describe, expect, it } from 'vitest';
import {
  buildGenerateCoverLetterPrompt,
  isCoverLetterGeneration,
  plannedRequirementIds,
  type CoverLetterPlan,
} from './generateCoverLetter';

const validResult = {
  greeting: 'Dear Hiring Manager,',
  paragraphs: [
    { sentences: [{ text: 'I am excited to apply.', claim: false, atomIds: [] }] },
    { sentences: [{ text: 'I bring relevant experience.', claim: true, atomIds: ['skills-abc123'] }] },
  ],
  closing: 'Sincerely,',
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

  it('keeps the ownership verb, bans stock phrases and impact framing', () => {
    const prompt = buildGenerateCoverLetterPrompt({
      candidateName: 'Jane Doe',
      roleSummary: 'Builds widgets.',
      requirements: [],
      candidates: [],
    });
    expect(prompt).toContain('"assisted" stays "assisted"');
    expect(prompt).toContain('Never open with "I am excited to apply"');
    expect(prompt).toContain('I look forward to\n     discussing how my experience can contribute');
    expect(prompt).toContain('seamless, aligns');
    expect(prompt).toContain('Never mention the profile');
    expect(prompt).toContain('career change or an employment gap');
    expect(prompt).toContain('plain ASCII hyphens');
    expect(prompt).not.toContain('business value');
    expect(prompt).not.toContain('in terms of their impact');
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

describe('plan in the prompt', () => {
  const base = { candidateName: 'Jane Doe', roleSummary: 'Builds widgets.', requirements: [], candidates: [] };
  const ev = (atomId: string, sourceLabel: string) => ({ atomId, sourceLabel, text: `text of ${atomId}` });
  const plan: CoverLetterPlan = {
    requirements: [
      { id: 'r1', text: 'Chart documentation', evidence: ev('e1', 'Experience: Scribe, Hospital') },
      { id: 'r2', text: 'Triage calls', evidence: ev('e2', 'Experience: Volunteer, Clinic') },
    ],
    gap: { id: 'r3', text: 'Epic EHR', evidence: ev('e3', 'Experience: Scribe, Hospital') },
    summaryAtomId: 'sum1',
  };

  it('asks for one body paragraph per planned requirement and lists the plan', () => {
    const prompt = buildGenerateCoverLetterPrompt({ ...base, plan });
    expect(prompt).toContain('EXACTLY 4 paragraphs');
    expect(prompt).toContain('Body paragraph 1 answers requirement id "r1"');
    expect(prompt).toContain('Body paragraph 2 answers requirement id "r2"');
    expect(prompt).toContain('Gap: the posting asks for "Epic EHR"');
    expect(prompt).toContain('citing the Summary line (id sum1)');
    expect(prompt).toContain('"requirementIds":["…"]');
    expect(prompt).toContain('"r1", "r2", "r3"');
  });

  it('uses 3 paragraphs for one requirement or none, with no gap line when there is no gap', () => {
    const one = buildGenerateCoverLetterPrompt({ ...base, plan: { requirements: [plan.requirements[0]] } });
    expect(one).toContain('EXACTLY 3 paragraphs');
    expect(one).not.toContain('Gap:');
    expect(buildGenerateCoverLetterPrompt(base)).toContain('EXACTLY 3 paragraphs');
    expect(buildGenerateCoverLetterPrompt(base)).not.toContain('LETTER PLAN (decided');
  });
});

describe('plannedRequirementIds', () => {
  const ids = new Set(['r1', 'r2']);
  const s = (requirementIds?: unknown) => ({ text: 'x', claim: true, atomIds: [], requirementIds });

  it('keeps known ids, drops unknown ones, and treats a missing or malformed field as []', () => {
    expect(plannedRequirementIds(s(['r1', 'zzz', 5]), ids)).toEqual(['r1']);
    expect(plannedRequirementIds(s(), ids)).toEqual([]);
    expect(plannedRequirementIds(s('r1'), ids)).toEqual([]);
  });

  it('is accepted by the validator with or without the field', () => {
    const reply = (extra: object) => ({
      greeting: 'Hi,',
      paragraphs: [{ sentences: [{ text: 'x', claim: false, atomIds: [], ...extra }] }],
      closing: 'Bye,',
    });
    expect(isCoverLetterGeneration(reply({}))).toBe(true);
    expect(isCoverLetterGeneration(reply({ requirementIds: ['r1'] }))).toBe(true);
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

  it('rejects a paragraph with no sentences or a blank sentence', () => {
    expect(isCoverLetterGeneration({ ...validResult, paragraphs: [{ sentences: [] }] })).toBe(false);
    expect(
      isCoverLetterGeneration({ ...validResult, paragraphs: [{ sentences: [{ text: '  ', claim: false, atomIds: [] }] }] }),
    ).toBe(false);
  });

  it('rejects the old shape of plain paragraph strings', () => {
    expect(isCoverLetterGeneration({ ...validResult, paragraphs: ['I am excited to apply.'] })).toBe(false);
  });

  it('rejects a sentence missing its claim flag or ids', () => {
    expect(
      isCoverLetterGeneration({ ...validResult, paragraphs: [{ sentences: [{ text: 'x', atomIds: [] }] }] }),
    ).toBe(false);
    expect(
      isCoverLetterGeneration({ ...validResult, paragraphs: [{ sentences: [{ text: 'x', claim: true }] }] }),
    ).toBe(false);
  });

  it('rejects a missing greeting or closing', () => {
    const { greeting: _omit, ...rest } = validResult;
    expect(isCoverLetterGeneration(rest)).toBe(false);
    expect(isCoverLetterGeneration({ ...validResult, closing: 42 })).toBe(false);
  });
});
