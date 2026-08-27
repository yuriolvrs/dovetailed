// What this file is: unit tests for the direct-selection pass -- confirms
// invented ids are dropped, duplicates collapse, the model's ordering is
// kept, and notes about evidence that didn't survive are removed. The LLM is
// mocked (CLAUDE.md: never call the real LLM in tests).
// In plain terms: tests proving we only ever keep the AI's picks that point
// at real parts of your profile.

import { describe, expect, it, vi } from 'vitest';
import { runHolisticSelection, selectHolisticCandidates } from './runHolisticSelection';
import { MAX_ATOMS } from '../../prompts/selectProfileHolistic';
import type { JobPosting, ProfileAtom } from '../../types';

const { generateStructuredMock } = vi.hoisted(() => ({ generateStructuredMock: vi.fn() }));
vi.mock('../llm', () => ({ generateStructured: generateStructuredMock }));

function atom(overrides: Partial<ProfileAtom>): ProfileAtom {
  return { id: 'a1', source: 'skills', sourceLabel: 'Skills', text: '', ...overrides };
}

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return { id: 'j1', createdAt: 0, rawText: 'A job posting.', ...overrides };
}

const baseResult = {
  roleSummary: 'A role.',
  atomIds: ['real'],
  overallRationale: 'Led with the real one.',
  groupNotes: [],
};

describe('selectHolisticCandidates', () => {
  it('caps the profile at MAX_ATOMS, keeping profile order', () => {
    const atoms = Array.from({ length: MAX_ATOMS + 25 }, (_, i) => atom({ id: `a${i}` }));
    const selected = selectHolisticCandidates(atoms);

    expect(selected).toHaveLength(MAX_ATOMS);
    expect(selected[0].id).toBe('a0');
    expect(selected[MAX_ATOMS - 1].id).toBe(`a${MAX_ATOMS - 1}`);
  });

  it('offers education atoms, unlike requirement matching', () => {
    const atoms = [atom({ id: 'edu', source: 'education', sourceLabel: 'Education: BSc, Uni' })];
    expect(selectHolisticCandidates(atoms).map((a) => a.id)).toEqual(['edu']);
  });
});

describe('runHolisticSelection', () => {
  it('drops ids the model was never offered', async () => {
    const atoms = [atom({ id: 'real', text: 'Java' })];
    generateStructuredMock.mockResolvedValueOnce({ ...baseResult, atomIds: ['real', 'invented'] });

    const selection = await runHolisticSelection(posting(), atoms);

    expect(selection.atomIds).toEqual(['real']);
  });

  it('keeps the model ordering rather than profile order', async () => {
    const atoms = [atom({ id: 'first' }), atom({ id: 'second' }), atom({ id: 'third' })];
    generateStructuredMock.mockResolvedValueOnce({ ...baseResult, atomIds: ['third', 'first'] });

    const selection = await runHolisticSelection(posting(), atoms);

    expect(selection.atomIds).toEqual(['third', 'first']);
  });

  it('collapses a repeated id so it cannot be double-weighted downstream', async () => {
    const atoms = [atom({ id: 'real' })];
    generateStructuredMock.mockResolvedValueOnce({ ...baseResult, atomIds: ['real', 'real'] });

    const selection = await runHolisticSelection(posting(), atoms);

    expect(selection.atomIds).toEqual(['real']);
  });

  it('drops a group note whose sourceLabel no surviving atom carries', async () => {
    const atoms = [atom({ id: 'real', sourceLabel: 'Skills' })];
    generateStructuredMock.mockResolvedValueOnce({
      ...baseResult,
      atomIds: ['real', 'invented'],
      groupNotes: [
        { sourceLabel: 'Skills', note: 'Kept.' },
        { sourceLabel: 'Experience: Ghost, Nowhere', note: 'Refers to nothing that survived.' },
      ],
    });

    const selection = await runHolisticSelection(posting(), atoms);

    expect(selection.groupNotes).toEqual([{ sourceLabel: 'Skills', note: 'Kept.' }]);
  });

  it('carries the roleSummary and rationale through, and stamps createdAt', async () => {
    const atoms = [atom({ id: 'real' })];
    generateStructuredMock.mockResolvedValueOnce(baseResult);

    const selection = await runHolisticSelection(posting(), atoms);

    expect(selection.roleSummary).toBe('A role.');
    expect(selection.overallRationale).toBe('Led with the real one.');
    expect(selection.createdAt).toBeGreaterThan(0);
  });
});
