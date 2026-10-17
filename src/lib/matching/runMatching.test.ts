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
  it('never offers the Summary line as evidence for a requirement', async () => {
    const req = requirement({ text: 'Attention to detail' });
    const atoms = [atom({ source: 'additional', sourceLabel: 'Summary', text: 'Strong attention to detail' })];

    const result = await runMatching([req], atoms);

    expect(result).toEqual([{ requirementId: 'r1', status: 'gap_no_candidates', atomIds: [] }]);
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

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

describe('runMatching second look at gaps', () => {
  const bullet = atom({
    id: 'b1',
    source: 'experience',
    sourceLabel: 'Experience: Assistant, Shop',
    text: 'Wrote some product descriptions',
  });
  const gapReq = requirement({ id: 'cs', text: 'Kubernetes orchestration' });

  it('upgrades a no-candidates gap to the status the model returns, mapping by position', async () => {
    generateStructuredMock.mockReset();
    generateStructuredMock.mockResolvedValueOnce({ results: [{ requirement: 0, lines: [0], status: 'partial' }] });
    const progress: [number, number][] = [];

    const result = await runMatching([gapReq], [bullet], (d, t) => progress.push([d, t]));

    expect(result).toEqual([{ requirementId: 'cs', status: 'partial', atomIds: ['b1'] }]);
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    expect(generateStructuredMock.mock.calls[0][0]).toContain('Wrote some product descriptions');
    expect(progress.at(-1)).toEqual([2, 2]);
    expect(progress.every(([d, t]) => d <= t)).toBe(true);
  });

  it('also upgrades a gap_unverified requirement', async () => {
    generateStructuredMock.mockReset();
    const req = requirement({ id: 'ps', text: 'Photoshop editing' });
    const atoms = [
      atom({ id: 'ps-skill', text: 'Photoshop' }),
      atom({ id: 'ps-b', source: 'projects', sourceLabel: 'Project: Store', text: 'Edited photos in Photoshop' }),
    ];
    generateStructuredMock
      .mockResolvedValueOnce({ atomIds: [], status: 'full' })
      .mockResolvedValueOnce({ results: [{ requirement: 0, lines: [0], status: 'full' }] });

    const result = await runMatching([req], atoms);

    expect(result).toEqual([{ requirementId: 'ps', status: 'full', atomIds: ['ps-b'] }]);
  });

  it('skips education requirements and excludes Summary and education atoms from the offered lines', async () => {
    generateStructuredMock.mockReset();
    const edu = requirement({ id: 'ed', text: "Master's degree in Physics", kind: 'education' });
    const atoms = [
      bullet,
      atom({ id: 'sum', source: 'additional', sourceLabel: 'Summary', text: 'Summary unique words here' }),
      atom({ id: 'deg', source: 'education', sourceLabel: 'Education: B.S.', text: 'Education unique words here' }),
    ];
    generateStructuredMock.mockResolvedValueOnce({ results: [] });

    await runMatching([edu, gapReq], atoms);

    const prompt = generateStructuredMock.mock.calls[0][0] as string;
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    expect(prompt).toContain('Kubernetes orchestration');
    expect(prompt).not.toContain('Master');
    expect(prompt).not.toContain('Summary unique');
    expect(prompt).not.toContain('Education unique');
  });

  it('drops out-of-range line and requirement numbers', async () => {
    generateStructuredMock.mockReset();
    generateStructuredMock.mockResolvedValueOnce({
      results: [
        { requirement: 5, lines: [0], status: 'full' },
        { requirement: 0, lines: [9], status: 'full' },
      ],
    });

    const result = await runMatching([gapReq], [bullet]);

    expect(result).toEqual([{ requirementId: 'cs', status: 'gap_no_candidates', atomIds: [] }]);
  });

  it('keeps the gaps when the second call fails', async () => {
    generateStructuredMock.mockReset();
    generateStructuredMock.mockRejectedValueOnce(new Error('boom'));

    const result = await runMatching([gapReq], [bullet]);

    expect(result).toEqual([{ requirementId: 'cs', status: 'gap_no_candidates', atomIds: [] }]);
  });

  it('rethrows when the abort signal fired', async () => {
    generateStructuredMock.mockReset();
    const controller = new AbortController();
    generateStructuredMock.mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });

    await expect(runMatching([gapReq], [bullet], undefined, controller.signal)).rejects.toThrow('Aborted');
  });
});

describe('runMatching atomIds order', () => {
  it('puts experience and project bullets before skills, keeping the model order within groups', async () => {
    generateStructuredMock.mockReset();
    const req = requirement({ text: 'Photoshop editing' });
    const atoms = [
      atom({ id: 'skill', source: 'skills', text: 'Photoshop' }),
      atom({ id: 'add', source: 'additional', sourceLabel: 'Additional', text: 'Photoshop hobbyist' }),
      atom({ id: 'exp', source: 'experience', sourceLabel: 'Experience: X', text: 'Edited images in Photoshop' }),
      atom({ id: 'proj', source: 'projects', sourceLabel: 'Project: Y', text: 'Photoshop mockups' }),
    ];
    generateStructuredMock.mockResolvedValueOnce({ atomIds: ['skill', 'add', 'proj', 'exp'], status: 'full' });

    const result = await runMatching([req], atoms);

    expect(result[0].atomIds).toEqual(['proj', 'exp', 'skill', 'add']);
  });
});
