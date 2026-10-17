// What this file is: unit tests for the overall fit-score calculation.
// In plain terms: tests proving the "how good a fit is this job" percentage
// comes out right for a few representative cases.

import { describe, expect, it } from 'vitest';
import { computeFitScore, requirementWeight } from './fitScore';
import type { JobAnalysis, Requirement, RequirementMatch } from '../../types';

function requirement(overrides: Partial<Requirement>): Requirement {
  return { id: 'r1', text: '', severity: 'required', order: 0, ...overrides };
}

function analysis(requirements: Requirement[], matches: RequirementMatch[]): JobAnalysis {
  return { roleSummary: '', requirements, keywords: [], matches };
}

describe('computeFitScore', () => {
  it('returns null before matching has run', () => {
    const a = analysis([requirement({})], []);
    expect(computeFitScore(a)).toBeNull();
  });

  it('returns null when there are no requirements', () => {
    expect(computeFitScore(analysis([], []))).toBeNull();
  });

  it('returns 100 when every requirement is fully matched', () => {
    const reqs = [requirement({ id: 'r1' }), requirement({ id: 'r2', severity: 'preferred' })];
    const matches: RequirementMatch[] = [
      { requirementId: 'r1', status: 'full', atomIds: ['a'] },
      { requirementId: 'r2', status: 'full', atomIds: ['b'] },
    ];
    expect(computeFitScore(analysis(reqs, matches))).toBe(100);
  });

  it('weighs required requirements more than preferred ones', () => {
    const reqs = [requirement({ id: 'r1', severity: 'required' }), requirement({ id: 'r2', severity: 'preferred' })];
    // required requirement is a full gap, preferred is fully matched --
    // required carries double the weight, so the score should be well under 50%.
    const matches: RequirementMatch[] = [
      { requirementId: 'r1', status: 'gap_no_candidates', atomIds: [] },
      { requirementId: 'r2', status: 'full', atomIds: ['b'] },
    ];
    expect(computeFitScore(analysis(reqs, matches))).toBe(33);
  });

  it('counts a partial match as half credit', () => {
    const reqs = [requirement({ id: 'r1' })];
    const matches: RequirementMatch[] = [{ requirementId: 'r1', status: 'partial', atomIds: ['a'] }];
    expect(computeFitScore(analysis(reqs, matches))).toBe(50);
  });
});

describe('requirementWeight and kinds', () => {
  it('weighs a required duty like a preferred item, below a required qualification', () => {
    expect(requirementWeight(requirement({ severity: 'required' }))).toBe(2);
    expect(requirementWeight(requirement({ severity: 'required', kind: 'qualification' }))).toBe(2);
    expect(requirementWeight(requirement({ severity: 'required', kind: 'duty' }))).toBe(1);
    expect(requirementWeight(requirement({ severity: 'preferred', kind: 'duty' }))).toBe(1);
  });

  it('education follows its severity', () => {
    expect(requirementWeight(requirement({ severity: 'required', kind: 'education' }))).toBe(2);
    expect(requirementWeight(requirement({ severity: 'preferred', kind: 'education' }))).toBe(1);
  });

  it('a missed duty costs less than a missed required qualification', () => {
    const reqs = [requirement({ id: 'q', kind: 'qualification' }), requirement({ id: 'd', kind: 'duty' })];
    const miss = (id: string): RequirementMatch[] =>
      ['q', 'd'].map((r) =>
        r === id
          ? { requirementId: r, status: 'gap_no_candidates', atomIds: [] }
          : { requirementId: r, status: 'full', atomIds: ['a'] },
      );
    expect(computeFitScore(analysis(reqs, miss('d')))).toBe(67);
    expect(computeFitScore(analysis(reqs, miss('q')))).toBe(33);
  });
});
