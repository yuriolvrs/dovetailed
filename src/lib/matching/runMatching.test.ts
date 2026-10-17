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

describe('runMatching batching', () => {
  it('checks several requirements in one call and maps each answer back by label', async () => {
    generateStructuredMock.mockReset();
    const reqs = [requirement({ id: 'r1', text: 'Java experience' }), requirement({ id: 'r2', text: 'Python experience' })];
    const atoms = [atom({ id: 'java', text: 'Java' }), atom({ id: 'python', text: 'Python' })];
    generateStructuredMock.mockResolvedValueOnce({
      results: [
        { requirement: 'R2', atomIds: ['python'], status: 'partial' },
        { requirement: 'R1', atomIds: ['java', 'python'], status: 'full' },
      ],
    });
    const progress: number[] = [];

    const result = await runMatching(reqs, atoms, (done) => progress.push(done));

    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      // Python was not a candidate for the Java requirement, so it is dropped.
      { requirementId: 'r1', status: 'full', atomIds: ['java'] },
      { requirementId: 'r2', status: 'partial', atomIds: ['python'] },
    ]);
    expect(progress).toEqual([2]);
  });

  it('rechecks on its own a requirement the batched reply left out', async () => {
    generateStructuredMock.mockReset();
    const reqs = [requirement({ id: 'r1', text: 'Java experience' }), requirement({ id: 'r2', text: 'Python experience' })];
    const atoms = [atom({ id: 'java', text: 'Java' }), atom({ id: 'python', text: 'Python' })];
    generateStructuredMock
      .mockResolvedValueOnce({ results: [{ requirement: 'R1', atomIds: ['java'], status: 'full' }] })
      .mockResolvedValueOnce({ atomIds: ['python'], status: 'full' });

    const result = await runMatching(reqs, atoms);

    expect(generateStructuredMock).toHaveBeenCalledTimes(2);
    expect(result[1]).toEqual({ requirementId: 'r2', status: 'full', atomIds: ['python'] });
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

describe('runMatching education routing', () => {
  it('decides an education requirement in code, without calling the LLM', async () => {
    generateStructuredMock.mockReset();
    const req = requirement({ id: 'ed', text: "Bachelor's degree in Biology", kind: 'education' });
    const atoms = [atom({ id: 'deg', source: 'education', sourceLabel: 'Education: B.S., State U', text: 'B.S. in Biology' })];
    const progress: number[] = [];

    const result = await runMatching([req], atoms, (done) => progress.push(done));

    expect(result).toEqual([{ requirementId: 'ed', status: 'full', atomIds: ['deg'] }]);
    expect(generateStructuredMock).not.toHaveBeenCalled();
    expect(progress).toEqual([1]);
  });

  it('sends other kinds through the LLM, keeping result order', async () => {
    generateStructuredMock.mockReset();
    const reqs = [
      requirement({ id: 'ed', text: 'Associate degree', kind: 'education' }),
      requirement({ id: 'du', text: 'Java experience', kind: 'duty' }),
    ];
    const atoms = [
      atom({ id: 'deg', source: 'education', sourceLabel: 'Education: A.A., State U', text: 'A.A.' }),
      atom({ id: 'java', text: 'Java' }),
    ];
    generateStructuredMock.mockResolvedValueOnce({ atomIds: ['java'], status: 'full' });

    const result = await runMatching(reqs, atoms);

    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    expect(result.map((m) => [m.requirementId, m.status])).toEqual([
      ['ed', 'full'],
      ['du', 'full'],
    ]);
  });
});
