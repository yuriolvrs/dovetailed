// What this file is: unit tests for interview-prep generation orchestration
// -- the defensive atomId filtering (evidence candidate selection itself is
// already covered by generateCoverLetterContent.test.ts, since this reuses
// that same function). The LLM is mocked (CLAUDE.md: never call the real LLM
// in tests).
// In plain terms: tests proving we never trust an atom id back that we
// didn't actually offer the AI.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateInterviewPrepContent } from './generateInterviewPrepContent';
import type { JobAnalysis, JobPosting, ProfileAtom } from '../../types';

const { generateStructuredMock } = vi.hoisted(() => ({ generateStructuredMock: vi.fn() }));
vi.mock('../llm', () => ({ generateStructured: generateStructuredMock }));

function atom(overrides: Partial<ProfileAtom>): ProfileAtom {
  return { id: 'a1', source: 'skills', sourceLabel: 'Skills', text: '', ...overrides };
}

function analysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return { roleSummary: 'Builds widgets.', requirements: [], keywords: [], matches: [], ...overrides };
}

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return { id: 'j1', createdAt: 0, rawText: '', analysis: analysis(), ...overrides };
}

describe('generateInterviewPrepContent', () => {
  beforeEach(() => generateStructuredMock.mockClear());

  it('drops any atomId the model returns that was not actually offered as a candidate', async () => {
    const offered = atom({ id: 'real1', text: 'React' });
    generateStructuredMock.mockResolvedValueOnce({
      questions: [
        { question: 'Tell me about your React experience.', rationale: 'Directly relevant.' },
        { question: 'Why this role?', rationale: 'General fit.' },
      ],
      sourceMap: [
        { generatedText: 'Tell me about your React experience.', atomIds: ['real1', 'invented-id'] },
        { generatedText: 'Why this role?', atomIds: [] },
      ],
    });

    const result = await generateInterviewPrepContent(posting(), [offered]);

    expect(result.sourceMap).toEqual([
      { generatedText: 'Tell me about your React experience.', atomIds: ['real1'] },
      { generatedText: 'Why this role?', atomIds: [] },
    ]);
    expect(result.content).toEqual({
      questions: [
        { question: 'Tell me about your React experience.', rationale: 'Directly relevant.' },
        { question: 'Why this role?', rationale: 'General fit.' },
      ],
    });
  });

  it('throws when the posting has no analysis', async () => {
    await expect(
      generateInterviewPrepContent(posting({ analysis: undefined }), []),
    ).rejects.toThrow();
  });
});
