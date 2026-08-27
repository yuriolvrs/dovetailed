// What this file is: unit tests for the direct-selection pass -- confirms
// invented ids are dropped, duplicates collapse, the model's ordering is
// kept, and notes about evidence that didn't survive are removed. The LLM is
// mocked (CLAUDE.md: never call the real LLM in tests).
// In plain terms: tests proving we only ever keep the AI's picks that point
// at real parts of your profile.

import { describe, expect, it, vi } from 'vitest';
import { runHolisticSelection, selectHolisticCandidates, stripAtomIdReferences } from './runHolisticSelection';
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
  asks: 'The posting asks for Java.',
  chose: 'I chose the real one.',
  leftOut: 'I left out nothing.',
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

  it('carries the roleSummary and all three reasoning parts through, and stamps createdAt', async () => {
    const atoms = [atom({ id: 'real' })];
    generateStructuredMock.mockResolvedValueOnce(baseResult);

    const selection = await runHolisticSelection(posting(), atoms);

    expect(selection.roleSummary).toBe('A role.');
    expect(selection.rationale).toEqual({
      asks: 'The posting asks for Java.',
      chose: 'I chose the real one.',
      leftOut: 'I left out nothing.',
    });
    expect(selection.createdAt).toBeGreaterThan(0);
  });

  it('strips ids out of every reasoning part, not just one', async () => {
    const atoms = [atom({ id: 'skills-9ab2' })];
    generateStructuredMock.mockResolvedValueOnce({
      ...baseResult,
      atomIds: ['skills-9ab2'],
      asks: 'It asks for Java (skills-9ab2).',
      chose: 'I chose Java (skills-9ab2).',
      leftOut: 'I left out nothing (skills-9ab2).',
    });

    const selection = await runHolisticSelection(posting(), atoms);

    expect(selection.rationale).toEqual({
      asks: 'It asks for Java.',
      chose: 'I chose Java.',
      leftOut: 'I left out nothing.',
    });
  });
});

describe('stripAtomIdReferences', () => {
  // Verbatim shapes from the first live run against the real model, which
  // ignored the prompt's ban and cited ids throughout its prose.
  const ids = new Set([
    'skills-1kxy8cf',
    'skills-221cdv',
    'skills-b7xg48',
    'experience-1oqwfd6',
    'experience-b4wals',
  ]);

  it('removes a single parenthesised id and the space before it', () => {
    expect(
      stripAtomIdReferences("I chose the project-management skill (skills-1kxy8cf) first.", ids),
    ).toBe('I chose the project-management skill first.');
  });

  it('removes a parenthesised list of several ids', () => {
    expect(
      stripAtomIdReferences(
        'Their e-commerce work (skills-b7xg48, experience-1oqwfd6, experience-b4wals) fits the role.',
        ids,
      ),
    ).toBe('Their e-commerce work fits the role.');
  });

  it('removes an id left bare in a sentence', () => {
    expect(stripAtomIdReferences('See skills-221cdv for the detail.', ids)).toBe('See for the detail.');
  });

  it('leaves prose with no ids exactly as written', () => {
    const clean = 'The posting asks for campaign reporting. This job covers that work.';
    expect(stripAtomIdReferences(clean, ids)).toBe(clean);
  });

  it('keeps parentheses that are not id references', () => {
    const text = 'The posting asks for spreadsheet work (Excel) and slides.';
    expect(stripAtomIdReferences(text, ids)).toBe(text);
  });

  it('preserves the blank lines that separate the three paragraphs', () => {
    const text = 'What it asks for (skills-1kxy8cf).\n\nWhat I chose.\n\nWhat I left out.';
    expect(stripAtomIdReferences(text, ids)).toBe(
      'What it asks for.\n\nWhat I chose.\n\nWhat I left out.',
    );
  });

  it('is a no-op when no ids were offered', () => {
    const text = 'Anything (at all) here.';
    expect(stripAtomIdReferences(text, new Set())).toBe(text);
  });
});

describe('stripAtomIdReferences guards against eating real words', () => {
  it('leaves a short id-like word alone when it is not shaped like an atom id', () => {
    // buildProfileAtoms always emits `${source}-${hash}`, so an id with no
    // hyphen cannot be a real one -- and stripping it would cut English.
    expect(stripAtomIdReferences('Led with the real one.', new Set(['real']))).toBe(
      'Led with the real one.',
    );
  });

  it('still strips a properly shaped id in the same sentence', () => {
    expect(
      stripAtomIdReferences('Led with the real one (skills-9ab2).', new Set(['real', 'skills-9ab2'])),
    ).toBe('Led with the real one.');
  });
});
