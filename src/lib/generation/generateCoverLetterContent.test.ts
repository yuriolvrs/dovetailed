// What this file is: unit tests for cover letter generation orchestration --
// evidence candidate selection and the defensive atomId filtering. The LLM
// is mocked (CLAUDE.md: never call the real LLM in tests).
// In plain terms: tests proving we hand the AI the right evidence and never
// trust an atom id back that we didn't actually offer it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCoverLetterContent, selectEvidenceCandidates } from './generateCoverLetterContent';
import type { JobAnalysis, JobPosting, Profile, ProfileAtom } from '../../types';

const { generateStructuredMock } = vi.hoisted(() => ({ generateStructuredMock: vi.fn() }));
vi.mock('../llm', () => ({ generateStructured: generateStructuredMock }));

function atom(overrides: Partial<ProfileAtom>): ProfileAtom {
  return { id: 'a1', source: 'skills', sourceLabel: 'Skills', text: '', ...overrides };
}

function analysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return { roleSummary: 'Builds widgets.', requirements: [], keywords: [], matches: [], ...overrides };
}

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'p1',
    contact: { name: 'Jane Doe', email: '', links: [] },
    summary: '',
    skills: [],
    experience: [],
    projects: [],
    education: [],
    writingSamples: [],
    additionalInfo: [],
    ...overrides,
  };
}

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return { id: 'j1', createdAt: 0, rawText: '', analysis: analysis(), ...overrides };
}

describe('selectEvidenceCandidates', () => {
  it('orders matched atoms first, then additionalInfo, then the rest, deduped', () => {
    const matched = atom({ id: 'm1', text: 'React' });
    const additional = atom({ id: 'add1', source: 'additional', text: 'Ran a marathon' });
    const rest = atom({ id: 'r1', text: 'Python' });
    const a = analysis({ matches: [{ requirementId: 'req1', status: 'full', atomIds: ['m1'] }] });

    const result = selectEvidenceCandidates(a, [rest, additional, matched]);

    expect(result.map((x) => x.id)).toEqual(['m1', 'add1', 'r1']);
  });

  it('caps the candidate list at MAX_CANDIDATES', () => {
    const many = Array.from({ length: 40 }, (_, i) => atom({ id: `x${i}`, text: `skill ${i}` }));
    const result = selectEvidenceCandidates(analysis(), many);
    expect(result.length).toBeLessThanOrEqual(24);
  });
});

describe('generateCoverLetterContent', () => {
  beforeEach(() => generateStructuredMock.mockClear());

  it('drops any atomId the model returns that was not actually offered as a candidate', async () => {
    const offered = atom({ id: 'real1', text: 'React' });
    generateStructuredMock.mockResolvedValueOnce({
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['I love React.', 'I am excited.'],
      closing: 'Sincerely,',
      sourceMap: [
        { generatedText: 'I love React.', atomIds: ['real1', 'invented-id'] },
        { generatedText: 'I am excited.', atomIds: [] },
      ],
    });

    const result = await generateCoverLetterContent(profile(), posting(), [offered]);

    expect(result.sourceMap).toEqual([
      { generatedText: 'I love React.', atomIds: ['real1'] },
      { generatedText: 'I am excited.', atomIds: [] },
    ]);
    expect(result.content).toEqual({
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['I love React.', 'I am excited.'],
      closing: 'Sincerely,',
    });
  });

  it('throws when the posting has no analysis', async () => {
    await expect(
      generateCoverLetterContent(profile(), posting({ analysis: undefined }), []),
    ).rejects.toThrow();
  });

  it('only includes a writing style sample when useWritingStyle is true and a sample exists', async () => {
    generateStructuredMock.mockResolvedValue({
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['Hi.'],
      closing: 'Sincerely,',
      sourceMap: [{ generatedText: 'Hi.', atomIds: [] }],
    });
    const withSample = profile({ writingSamples: ['My own distinctive voice.'] });

    await generateCoverLetterContent(withSample, posting(), [], { useWritingStyle: true });
    expect(generateStructuredMock.mock.calls[0][0]).toContain('My own distinctive voice.');

    generateStructuredMock.mockClear();
    await generateCoverLetterContent(withSample, posting(), [], { useWritingStyle: false });
    expect(generateStructuredMock.mock.calls[0][0]).not.toContain('My own distinctive voice.');
  });
});
