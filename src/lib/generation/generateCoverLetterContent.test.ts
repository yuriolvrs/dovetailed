// What this file is: unit tests for cover letter generation orchestration --
// evidence candidate selection and the defensive atomId filtering. The LLM
// is mocked (CLAUDE.md: never call the real LLM in tests).
// In plain terms: tests proving we hand the AI the right evidence and never
// trust an atom id back that we didn't actually offer it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCoverLetterContent, selectEvidenceCandidates, withoutRepeatedGreeting } from './generateCoverLetterContent';
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
      paragraphs: [
        { sentences: [{ text: 'I love React.', claim: true, atomIds: ['real1', 'invented-id'] }] },
        { sentences: [{ text: 'I am excited.', claim: false, atomIds: [] }] },
      ],
      closing: 'Sincerely,',
    });

    const result = await generateCoverLetterContent(profile(), posting(), [offered]);

    expect(result.sourceMap).toEqual([
      { generatedText: 'I love React.', atomIds: ['real1'], claim: true },
      { generatedText: 'I am excited.', atomIds: [], claim: false },
    ]);
    expect(result.content).toEqual({
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['I love React.', 'I am excited.'],
      closing: 'Sincerely,',
    });
  });

  it('joins sentences into paragraphs, one sourceMap entry per sentence, ids stripped from text', async () => {
    const offered = atom({ id: 'experience-ab12c', text: 'Ran the fair' });
    generateStructuredMock.mockResolvedValueOnce({
      greeting: 'Dear Hiring Manager,',
      paragraphs: [
        {
          sentences: [
            { text: 'Dear Hiring Manager, I want this role.', claim: false, atomIds: [] },
            { text: 'I ran the spring fair (experience-ab12c).', claim: true, atomIds: ['experience-ab12c'] },
          ],
        },
      ],
      closing: 'Sincerely,',
    });

    const result = await generateCoverLetterContent(profile(), posting(), [offered]);

    expect(result.content.paragraphs).toEqual(['I want this role. I ran the spring fair.']);
    expect(result.sourceMap.map((e) => e.generatedText)).toEqual(['I want this role.', 'I ran the spring fair.']);
  });

  it('throws when the posting has no analysis', async () => {
    await expect(
      generateCoverLetterContent(profile(), posting({ analysis: undefined }), []),
    ).rejects.toThrow();
  });

  it('only includes a writing style sample when useWritingStyle is true and a sample exists', async () => {
    generateStructuredMock.mockResolvedValue({
      greeting: 'Dear Hiring Manager,',
      paragraphs: [{ sentences: [{ text: 'Hi.', claim: false, atomIds: [] }] }],
      closing: 'Sincerely,',
    });
    const withSample = profile({ writingSamples: ['My own distinctive voice.'] });

    await generateCoverLetterContent(withSample, posting(), [], { useWritingStyle: true });
    expect(generateStructuredMock.mock.calls[0][0]).toContain('My own distinctive voice.');

    generateStructuredMock.mockClear();
    await generateCoverLetterContent(withSample, posting(), [], { useWritingStyle: false });
    expect(generateStructuredMock.mock.calls[0][0]).not.toContain('My own distinctive voice.');
  });
});

describe('generateCoverLetterContent claim check', () => {
  beforeEach(() => generateStructuredMock.mockReset());

  const letter = (text: string) => ({
    greeting: 'Dear Hiring Manager,',
    paragraphs: [{ sentences: [{ text, claim: true, atomIds: ['a1'] }] }],
    closing: 'Sincerely,',
  });

  it('replaces U+2011 hyphens and uses temperature 0.3', async () => {
    generateStructuredMock.mockResolvedValueOnce({
      ...letter('I did full‑time work.'),
      greeting: 'Dear Hiring‑Manager,',
      closing: 'Best‐wishes,',
    });
    const result = await generateCoverLetterContent(profile(), posting(), [atom({ id: 'a1', text: 'Worked full-time' })]);
    expect(result.content.paragraphs).toEqual(['I did full-time work.']);
    expect(result.content.greeting).toBe('Dear Hiring-Manager,');
    expect(result.content.closing).toBe('Best-wishes,');
    expect(result.sourceMap[0].generatedText).toBe('I did full-time work.');
    expect(generateStructuredMock.mock.calls[0][2].temperature).toBe(0.3);
  });

  it('sets supported from the verifier and applies a passing repair', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(letter('I managed the front desk.'))
      .mockResolvedValueOnce({ results: [{ index: 0, supported: false, issue: 'managed' }] })
      .mockResolvedValueOnce({ repairs: [{ index: 0, text: 'I assisted at the front desk.' }] })
      .mockResolvedValueOnce({ results: [{ index: 0, supported: true, issue: '' }] });
    const result = await generateCoverLetterContent(profile(), posting(), [
      atom({ id: 'a1', text: 'Assisted at the front desk' }),
    ]);
    expect(result.content.paragraphs).toEqual(['I assisted at the front desk.']);
    expect(result.sourceMap[0]).toMatchObject({ generatedText: 'I assisted at the front desk.', supported: true });
  });

  it('marks a sentence supported: false when the repair fails and keeps its text', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(letter('I managed the front desk.'))
      .mockResolvedValueOnce({ results: [{ index: 0, supported: false, issue: 'managed' }] })
      .mockResolvedValueOnce({ repairs: [{ index: 0, text: 'I ran the front desk.' }] })
      .mockResolvedValueOnce({ results: [{ index: 0, supported: false, issue: 'ran' }] });
    const result = await generateCoverLetterContent(profile(), posting(), [
      atom({ id: 'a1', text: 'Assisted at the front desk' }),
    ]);
    expect(result.content.paragraphs).toEqual(['I managed the front desk.']);
    expect(result.sourceMap[0].supported).toBe(false);
  });

  it('leaves supported undefined and still returns the letter when the check errors', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(letter('I assisted at the front desk.'))
      .mockRejectedValueOnce(new Error('down'));
    const result = await generateCoverLetterContent(profile(), posting(), [
      atom({ id: 'a1', text: 'Assisted at the front desk' }),
    ]);
    expect(result.content.paragraphs).toEqual(['I assisted at the front desk.']);
    expect(result.sourceMap[0].supported).toBeUndefined();
  });
});

describe('generateCoverLetterContent on the direct route', () => {
  beforeEach(() => generateStructuredMock.mockReset());

  const reply = {
    greeting: 'Dear Hiring Manager,',
    paragraphs: [{ sentences: [{ text: 'One.', claim: true, atomIds: ['h1'] }] }],
    closing: 'Sincerely,',
  };

  it('generates from the holistic pool on a posting with no analysis at all', async () => {
    generateStructuredMock.mockResolvedValueOnce(reply);
    const chosen = atom({ id: 'h1', text: 'Organised the campus hackathon' });

    const result = await generateCoverLetterContent(
      profile(),
      posting({ analysis: undefined }),
      [chosen],
      { holistic: { atoms: [chosen], roleSummary: 'Runs community events.' } },
    );

    expect(result.content.paragraphs).toEqual(['One.']);
    const prompt = generateStructuredMock.mock.calls[0][0] as string;
    expect(prompt).toContain('Runs community events.');
    expect(prompt).toContain('Organised the campus hackathon');
    expect(prompt).toContain('(none listed)'); // no requirements on this route
  });

  it('still refuses ids outside the holistic pool', async () => {
    generateStructuredMock.mockResolvedValueOnce({
      ...reply,
      paragraphs: [{ sentences: [{ text: 'One.', claim: true, atomIds: ['h1', 'invented'] }] }],
    });
    const chosen = atom({ id: 'h1', text: 'Real thing' });

    const result = await generateCoverLetterContent(profile(), posting({ analysis: undefined }), [chosen], {
      holistic: { atoms: [chosen], roleSummary: 'A role.' },
    });

    expect(result.sourceMap[0].atomIds).toEqual(['h1']);
  });

  it('still throws when there is neither an analysis nor a holistic pool', async () => {
    await expect(generateCoverLetterContent(profile(), posting({ analysis: undefined }), [])).rejects.toThrow(
      /no analysis/i,
    );
  });
});

describe('withoutRepeatedGreeting', () => {
  it('drops a salutation the model repeated at the start of the first paragraph', () => {
    expect(
      withoutRepeatedGreeting('Dear Hiring Manager at BPI,', ['Dear Hiring Manager at BPI, I am eager to apply.', 'Second.']),
    ).toEqual(['I am eager to apply.', 'Second.']);
  });

  it('leaves paragraphs alone when the greeting is not repeated', () => {
    const paragraphs = ['I am eager to apply.', 'Second.'];
    expect(withoutRepeatedGreeting('Dear Hiring Manager,', paragraphs)).toBe(paragraphs);
  });

  it('keeps a first paragraph that is only the greeting rather than emptying it', () => {
    expect(withoutRepeatedGreeting('Dear Team,', ['Dear Team,'])).toEqual(['Dear Team,']);
  });
});
