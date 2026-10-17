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
      { generatedText: 'I love React.', atomIds: ['real1'], claim: true, requirementIds: [] },
      { generatedText: 'I am excited.', atomIds: [], claim: false, requirementIds: [] },
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

describe('generateCoverLetterContent letter plan and checks', () => {
  beforeEach(() => generateStructuredMock.mockReset());

  const hospitalLabel = 'Experience: Scribe, St. Mary Hospital';
  const clinicLabel = 'Experience: Volunteer, Riverside Clinic';
  const hospitalAtom = atom({ id: 'h1', source: 'experience', sourceLabel: hospitalLabel, text: 'Documented patient visits' });
  const clinicAtom = atom({ id: 'c1', source: 'experience', sourceLabel: clinicLabel, text: 'Welcomed patients at the front desk' });
  const letterProfile = profile({
    experience: [
      { company: 'St. Mary Hospital', title: 'Scribe', current: false, bullets: ['Documented patient visits'] },
      { company: 'Riverside Clinic', title: 'Volunteer', current: false, bullets: ['Welcomed patients at the front desk'] },
    ],
  });
  const planned = posting({
    analysis: analysis({
      requirements: [{ id: 'r1', text: 'Document patient care', severity: 'required', order: 1 }],
      matches: [{ requirementId: 'r1', status: 'full', atomIds: ['h1'] }],
    }),
  });
  const reply = (sentences: unknown[][]) => ({
    greeting: 'Dear Hiring Manager,',
    paragraphs: sentences.map((s) => ({ sentences: s })),
    closing: 'Sincerely,',
  });

  it('puts the plan in the prompt and carries valid requirementIds into the sourceMap', async () => {
    generateStructuredMock.mockResolvedValueOnce(
      reply([
        [
          { text: 'I documented patient visits.', claim: true, atomIds: ['h1'], requirementIds: ['r1', 'bogus'] },
          { text: 'I welcomed patients.', claim: true, atomIds: ['c1'], requirementIds: 'r1' },
          { text: 'Thank you.', claim: false, atomIds: [] },
        ],
      ]),
    );
    generateStructuredMock.mockResolvedValue({ results: [{ index: 0, supported: true, issue: '' }, { index: 1, supported: true, issue: '' }] });
    const result = await generateCoverLetterContent(letterProfile, planned, [hospitalAtom, clinicAtom]);
    const prompt = generateStructuredMock.mock.calls[0][0] as string;
    expect(prompt).toContain('LETTER PLAN');
    expect(prompt).toContain('Body paragraph 1 answers requirement id "r1"');
    expect(prompt).toContain(hospitalLabel);
    expect(result.sourceMap.map((e) => e.requirementIds)).toEqual([['r1'], [], []]);
  });

  it('flags a sentence that names the wrong employer and repairs it with its paragraph in view', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(
        reply([
          [
            { text: 'I documented patient visits.', claim: true, atomIds: ['h1'] },
            { text: 'At St. Mary Hospital I welcomed patients at the front desk.', claim: true, atomIds: ['c1'] },
          ],
        ]),
      )
      // The model check passes both; the employer check still fails the second.
      .mockResolvedValueOnce({
        results: [
          { index: 0, supported: true, issue: '' },
          { index: 1, supported: true, issue: '' },
        ],
      })
      .mockResolvedValueOnce({ repairs: [{ index: 0, text: 'At Riverside Clinic I welcomed patients at the front desk.' }] })
      .mockResolvedValueOnce({ results: [{ index: 0, supported: true, issue: '' }] });
    const result = await generateCoverLetterContent(letterProfile, planned, [hospitalAtom, clinicAtom]);

    const repairPrompt = generateStructuredMock.mock.calls[2][0] as string;
    expect(repairPrompt).toContain('PARAGRAPH: "I documented patient visits. At St. Mary Hospital I welcomed');
    expect(repairPrompt).toContain('issue: names the wrong employer');
    expect(repairPrompt).toContain(`from: ${clinicLabel}`);
    expect(result.content.paragraphs).toEqual([
      'I documented patient visits. At Riverside Clinic I welcomed patients at the front desk.',
    ]);
    expect(result.sourceMap[1].supported).toBe(true);
  });

  it('keeps the flag when the repair still names the wrong employer', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(
        reply([[{ text: 'At St. Mary Hospital I welcomed patients at the front desk.', claim: true, atomIds: ['c1'] }]]),
      )
      .mockResolvedValueOnce({ results: [{ index: 0, supported: true, issue: '' }] })
      .mockResolvedValueOnce({ repairs: [{ index: 0, text: 'At St. Mary Hospital I greeted patients.' }] });
    const result = await generateCoverLetterContent(letterProfile, planned, [hospitalAtom, clinicAtom]);
    expect(result.sourceMap[0].supported).toBe(false);
    expect(result.content.paragraphs[0]).toContain('At St. Mary Hospital I welcomed patients at the front desk.');
  });

  it('removes a repeated sentence and its sourceMap entry', async () => {
    generateStructuredMock.mockResolvedValueOnce(
      reply([
        [
          { text: 'I documented patient visits at the hospital.', claim: false, atomIds: [] },
          { text: 'At the hospital I documented patient visits.', claim: false, atomIds: [] },
          { text: 'I enjoy teamwork.', claim: false, atomIds: [] },
        ],
      ]),
    );
    const result = await generateCoverLetterContent(letterProfile, planned, [hospitalAtom]);
    expect(result.content.paragraphs).toEqual(['I documented patient visits at the hospital. I enjoy teamwork.']);
    expect(result.sourceMap.map((e) => e.generatedText)).toEqual([
      'I documented patient visits at the hospital.',
      'I enjoy teamwork.',
    ]);
  });

  it('strips meta phrases about the profile and drops an emptied paragraph', async () => {
    generateStructuredMock.mockResolvedValueOnce(
      reply([
        [{ text: 'I documented patient visits, as stated in my profile.', claim: false, atomIds: [] }],
        [{ text: 'My profile shows a record of care.', claim: false, atomIds: [] }],
      ]),
    );
    const result = await generateCoverLetterContent(letterProfile, planned, [hospitalAtom]);
    expect(result.content.paragraphs).toEqual(['I documented patient visits.']);
    expect(result.sourceMap).toHaveLength(1);
  });

  it('a repair that repeats another sentence is removed after repair', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(
        reply([
          [
            { text: 'I documented patient visits at the hospital.', claim: true, atomIds: ['h1'] },
            { text: 'I managed all hospital records.', claim: true, atomIds: ['h1'] },
          ],
        ]),
      )
      .mockResolvedValueOnce({
        results: [
          { index: 0, supported: true, issue: '' },
          { index: 1, supported: false, issue: 'managed' },
        ],
      })
      .mockResolvedValueOnce({ repairs: [{ index: 0, text: 'At the hospital I documented patient visits.' }] })
      .mockResolvedValueOnce({ results: [{ index: 0, supported: true, issue: '' }] });
    const result = await generateCoverLetterContent(letterProfile, planned, [hospitalAtom]);
    expect(result.content.paragraphs).toEqual(['I documented patient visits at the hospital.']);
    expect(result.sourceMap).toHaveLength(1);
  });

  it('holistic route: simple plan with no requirements and no gap, summary offered when present', async () => {
    const summary = atom({ id: 'sum', source: 'additional', sourceLabel: 'Summary', text: 'Moving into health IT' });
    generateStructuredMock.mockResolvedValueOnce(reply([[{ text: 'I want health IT work.', claim: true, atomIds: ['sum'] }]]));
    generateStructuredMock.mockResolvedValue({ results: [{ index: 0, supported: true, issue: '' }] });
    const chosen = atom({ id: 'h1', text: 'Documented visits' });
    await generateCoverLetterContent(letterProfile, posting({ analysis: undefined }), [chosen, summary], {
      holistic: { atoms: [chosen], roleSummary: 'A role.' },
    });
    const prompt = generateStructuredMock.mock.calls[0][0] as string;
    expect(prompt).toContain('citing the Summary line (id sum)');
    expect(prompt).toContain('id: sum |');
    expect(prompt).not.toContain('Body paragraph 1');
    expect(prompt).not.toContain('Gap:');
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

describe('generateCoverLetterContent target company', () => {
  beforeEach(() => generateStructuredMock.mockReset());

  it('does not flag an opening sentence that names the company applied to', async () => {
    const worked = profile({
      experience: [{ company: 'Riverside Clinic', title: 'Volunteer', current: false, bullets: ['Greeted patients'] }],
    });
    const other = atom({ id: 'o1', source: 'experience', sourceLabel: 'Experience: Scribe, Hospital', text: 'Charted visits' });
    generateStructuredMock
      .mockResolvedValueOnce({
        greeting: 'Dear Hiring Manager,',
        paragraphs: [{ sentences: [{ text: 'I would value the role at Riverside Clinic.', claim: true, atomIds: ['o1'] }] }],
        closing: 'Sincerely,',
      })
      .mockResolvedValueOnce({ results: [{ index: 0, supported: true, issue: '' }] });
    const result = await generateCoverLetterContent(worked, posting({ company: 'Riverside Clinic' }), [other]);
    expect(result.sourceMap[0].supported).toBe(true);
    expect(generateStructuredMock).toHaveBeenCalledTimes(2);
  });
});
