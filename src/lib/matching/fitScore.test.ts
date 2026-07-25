// What this file is: unit tests for the overall fit-score calculation.
// In plain terms: tests proving the "how good a fit is this job" percentage
// comes out right for a few representative cases.

import { describe, expect, it } from 'vitest';
import { computeFitScore } from './fitScore';
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
