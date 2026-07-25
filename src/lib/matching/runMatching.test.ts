// What this file is: unit tests for the matching orchestration -- confirms
// all four MatchStatus outcomes (full/partial/gap_no_candidates/
// gap_unverified) and the reject-fallback recalculation. The LLM is mocked
// (CLAUDE.md: never call the real LLM in tests).
// In plain terms: tests proving the "check each requirement against the
// profile" pipeline produces the right status in every case.

import { describe, expect, it, vi } from 'vitest';
import { runMatching, statusAfterReject } from './runMatching';
import type { ProfileAtom, Requirement, RequirementMatch } from '../../types';

const { generateStructuredMock } = vi.hoisted(() => ({ generateStructuredMock: vi.fn() }));
vi.mock('../llm', () => ({ generateStructured: generateStructuredMock }));

function requirement(overrides: Partial<Requirement>): Requirement {
  return { id: 'r1', text: '', severity: 'required', order: 0, ...overrides };
}

function atom(overrides: Partial<ProfileAtom>): ProfileAtom {
  return { id: 'a1', source: 'skills', sourceLabel: 'Skills', text: '', ...overrides };
}

describe('runMatching', () => {
  it('marks gap_no_candidates when retrieval finds nothing, without calling the LLM', async () => {
    const req = requirement({ text: 'Experience with Kubernetes' });
    const atoms = [atom({ text: 'Photoshop' })];

    const result = await runMatching([req], atoms);

    expect(result).toEqual([{ requirementId: 'r1', status: 'gap_no_candidates', atomIds: [] }]);
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it('marks full/partial with confirmed atomIds when the LLM confirms a candidate', async () => {
    const req = requirement({ text: 'Java experience' });
    const atoms = [atom({ id: 'java', text: 'Java' })];
    generateStructuredMock.mockResolvedValueOnce({ atomIds: ['java'], status: 'full' });

    const result = await runMatching([req], atoms);

    expect(result).toEqual([{ requirementId: 'r1', status: 'full', atomIds: ['java'] }]);
  });

  it('marks gap_unverified when candidates exist but the LLM confirms none of them', async () => {
    const req = requirement({ text: 'Java experience' });
    const atoms = [atom({ id: 'java', text: 'Java' })];
    generateStructuredMock.mockResolvedValueOnce({ atomIds: [], status: 'full' });

    const result = await runMatching([req], atoms);

    expect(result).toEqual([
      { requirementId: 'r1', status: 'gap_unverified', atomIds: [], consideredAtomIds: ['java'] },
    ]);
  });

  it('ignores any atomId the LLM returns that was not in the candidate set', async () => {
    const req = requirement({ text: 'Java experience' });
    const atoms = [atom({ id: 'java', text: 'Java' })];
    generateStructuredMock.mockResolvedValueOnce({ atomIds: ['made-up-id'], status: 'full' });

    const result = await runMatching([req], atoms);

    expect(result).toEqual([
      { requirementId: 'r1', status: 'gap_unverified', atomIds: [], consideredAtomIds: ['java'] },
    ]);
  });
});

describe('statusAfterReject', () => {
  it('keeps other confirmed atoms if more than one was confirmed', () => {
    const match: RequirementMatch = { requirementId: 'r1', status: 'full', atomIds: ['a', 'b'] };
    const result = statusAfterReject(match, 'Java experience', [], 'a');
    expect(result).toEqual({ requirementId: 'r1', status: 'full', atomIds: ['b'] });
  });

  it('falls back to another retrieved candidate, keeping the existing status', () => {
    const match: RequirementMatch = { requirementId: 'r1', status: 'partial', atomIds: ['java'] };
    const atoms = [atom({ id: 'java', text: 'Java' }), atom({ id: 'jvm-note', text: 'JVM tuning' })];
    const result = statusAfterReject(match, 'Java experience', atoms, 'java');
    expect(result.status).toBe('partial');
    expect(result.atomIds).toEqual(['jvm-note']);
  });

  it('becomes gap_unverified when no fallback candidate remains', () => {
    const match: RequirementMatch = { requirementId: 'r1', status: 'full', atomIds: ['java'] };
    const atoms = [atom({ id: 'java', text: 'Java' })];
    const result = statusAfterReject(match, 'Java experience', atoms, 'java');
    expect(result).toEqual({ requirementId: 'r1', status: 'gap_unverified', atomIds: [], consideredAtomIds: [] });
  });
});
