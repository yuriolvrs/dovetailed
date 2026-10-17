// What this file is: unit tests for the Build pipeline. Every step it calls is
// mocked, so no LLM, database or browser layout runs (CLAUDE.md: never call
// the real LLM in tests).
// In plain terms: tests proving the Build button runs the four steps in order,
// skips what is already done, and stops cleanly when a step fails.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDocuments } from './buildDocuments';
import { JsonParseError } from '../json';
import type { JobAnalysis, JobPosting, Profile } from '../../types';

const m = vi.hoisted(() => ({
  generateStructured: vi.fn(),
  saveJobPosting: vi.fn(),
  runMatching: vi.fn(),
  saveGeneration: vi.fn(),
  selectResumeContent: vi.fn(),
  fitToOnePage: vi.fn(),
  generateCoverLetterContent: vi.fn(),
}));
vi.mock('../llm', async () => ({
  ...(await vi.importActual<typeof import('../llm')>('../llm')),
  generateStructured: m.generateStructured,
}));
vi.mock('../jobStore', () => ({ saveJobPosting: m.saveJobPosting, fillPostingDetails: (p: unknown) => p }));
vi.mock('../matching/runMatching', () => ({ runMatching: m.runMatching }));
vi.mock('../genStore', () => ({
  saveGeneration: m.saveGeneration,
  newGeneration: (id: string, type: string) => ({ id: `${id}-${type}`, type }),
}));
vi.mock('../generation/selectResumeContent', () => ({ selectResumeContent: m.selectResumeContent }));
vi.mock('../generation/fitToOnePage', () => ({ fitToOnePage: m.fitToOnePage }));
vi.mock('../generation/generateCoverLetterContent', () => ({
  generateCoverLetterContent: m.generateCoverLetterContent,
}));
vi.mock('../../prompts/analyzePosting', () => ({
  buildAnalyzePostingPrompt: () => 'prompt',
  isExtractedAnalysis: () => true,
  toJobAnalysis: () => ({
    roleSummary: 'Builds widgets.',
    requirements: [{ id: 'r1', text: 'Widgets', severity: 'required', order: 0 }],
    keywords: [],
    matches: [],
  }),
}));

const profile = {
  id: 'p1',
  contact: { name: 'Jane', email: '', links: [] },
  skills: [],
  experience: [],
  projects: [],
  education: [],
  writingSamples: [],
  additionalInfo: [],
} as unknown as Profile;

function posting(analysis?: JobAnalysis): JobPosting {
  return { id: 'j1', rawText: 'We need widgets.', createdAt: 1, analysis } as unknown as JobPosting;
}

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.generateStructured.mockResolvedValue({});
  m.runMatching.mockResolvedValue([{ requirementId: 'r1', status: 'full', atomIds: ['a1'] }]);
  m.selectResumeContent.mockReturnValue({ content: {}, sourceMap: [] });
  m.fitToOnePage.mockResolvedValue({ content: {}, removedExperience: [], fits: true });
  m.generateCoverLetterContent.mockResolvedValue({ content: {}, sourceMap: [] });
});

describe('buildDocuments', () => {
  it('runs all four steps in order and saves both documents', async () => {
    const steps: string[] = [];
    const result = await buildDocuments(posting(), profile, { onStepDone: (s) => steps.push(s) });
    expect(steps).toEqual(['read', 'match', 'resume', 'coverLetter']);
    expect(result.analysis?.matches).toHaveLength(1);
    expect(result.analysis?.matchesEdited).toBe(false);
    const saved = m.saveGeneration.mock.calls.map((c) => c[0].type);
    expect(saved).toEqual(['resume', 'coverLetter']);
  });

  it('skips reading and matching when the posting already has them', async () => {
    const done = {
      roleSummary: '',
      requirements: [{ id: 'r1', text: 'x', severity: 'required', order: 0 }],
      keywords: [],
      matches: [{ requirementId: 'r1', status: 'full', atomIds: [] }],
    } as unknown as JobAnalysis;
    await buildDocuments(posting(done), profile);
    expect(m.generateStructured).not.toHaveBeenCalled();
    expect(m.runMatching).not.toHaveBeenCalled();
    expect(m.generateCoverLetterContent).toHaveBeenCalledTimes(1);
  });

  it('stops at a failed step and keeps earlier work saved', async () => {
    m.generateCoverLetterContent.mockRejectedValue(new Error('boom'));
    await expect(buildDocuments(posting(), profile)).rejects.toThrow('boom');
    expect(m.saveJobPosting).toHaveBeenCalledTimes(2);
    expect(m.saveGeneration.mock.calls.map((c) => c[0].type)).toEqual(['resume']);
  });

  it('passes the stop signal to the resume step', async () => {
    const controller = new AbortController();
    await buildDocuments(posting(), profile, { signal: controller.signal });
    expect(m.fitToOnePage).toHaveBeenCalledWith({}, [], controller.signal);
  });

  it('reports matching progress', async () => {
    m.runMatching.mockImplementation(async (_r, _a, onProgress) => {
      onProgress(1, 1);
      return [];
    });
    const seen: unknown[] = [];
    await buildDocuments(posting(), profile, { onProgress: (p) => seen.push(p) });
    expect(seen).toContainEqual({ step: 'match', done: 1, total: 1 });
  });

  it('retries the letter once on an unusable response, then succeeds', async () => {
    m.generateCoverLetterContent.mockRejectedValueOnce(new JsonParseError('bad'));
    await buildDocuments(posting(), profile);
    expect(m.generateCoverLetterContent).toHaveBeenCalledTimes(2);
    expect(m.saveGeneration.mock.calls.map((c) => c[0].type)).toEqual(['resume', 'coverLetter']);
  });

  it('surfaces the error after the second letter failure', async () => {
    m.generateCoverLetterContent.mockRejectedValue(new JsonParseError('bad'));
    await expect(buildDocuments(posting(), profile)).rejects.toThrow('bad');
    expect(m.generateCoverLetterContent).toHaveBeenCalledTimes(2);
  });

  it('does not retry after a stop', async () => {
    const controller = new AbortController();
    m.generateCoverLetterContent.mockImplementation(async () => {
      controller.abort();
      throw new JsonParseError('bad');
    });
    await expect(buildDocuments(posting(), profile, { signal: controller.signal })).rejects.toThrow();
    expect(m.generateCoverLetterContent).toHaveBeenCalledTimes(1);
  });

  it('does not retry a plain error', async () => {
    m.generateCoverLetterContent.mockRejectedValue(new Error('boom'));
    await expect(buildDocuments(posting(), profile)).rejects.toThrow('boom');
    expect(m.generateCoverLetterContent).toHaveBeenCalledTimes(1);
  });

  it('retries the posting analysis once on an unusable response', async () => {
    m.generateStructured.mockRejectedValueOnce(new JsonParseError('bad')).mockResolvedValue({});
    await buildDocuments(posting(), profile);
    expect(m.generateStructured).toHaveBeenCalledTimes(2);
  });

  it('has the resume saved and reported before the letter starts', async () => {
    const order: string[] = [];
    m.generateCoverLetterContent.mockImplementation(async () => {
      order.push('letter');
      return { content: {}, sourceMap: [] };
    });
    await buildDocuments(posting(), profile, { onStepDone: (s) => order.push(s) });
    expect(order.indexOf('resume')).toBeLessThan(order.indexOf('letter'));
  });

  it('starts the match bar with a total that cannot shrink the bar later', async () => {
    const seen: { done?: number; total?: number }[] = [];
    await buildDocuments(posting(), profile, { onProgress: (p) => p.step === 'match' && seen.push(p) });
    expect(seen[0]).toEqual({ step: 'match', done: 0, total: 2 });
  });
});
