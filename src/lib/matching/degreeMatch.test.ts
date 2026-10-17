// What this file is: unit tests for the deterministic degree matcher.
// In plain terms: tests proving a degree requirement is judged correctly,
// for example that a bachelor's meets an associate requirement but not the
// other way around.

import { describe, expect, it } from 'vitest';
import { degreeLevelsIn, matchDegree } from './degreeMatch';
import type { ProfileAtom, Requirement } from '../../types';

function req(text: string): Requirement {
  return { id: 'r', text, severity: 'required', order: 0, kind: 'education' };
}

function degree(text: string, id = 'deg'): ProfileAtom {
  return { id, source: 'education', sourceLabel: `Education: ${text}, State U`, text };
}

const job: ProfileAtom = { id: 'job', source: 'experience', sourceLabel: 'Experience: Clerk, Shop', text: 'Ran the till' };

describe('degreeLevelsIn', () => {
  it.each([
    ['High school diploma or GED', 1],
    ['A.A.S. in Nursing', 2],
    ['Associate of Arts', 2],
    ['B.S. in Biology', 3],
    ['BSN', 3],
    ['B.A.', 3],
    ["Bachelor's degree", 3],
    ['MBA', 4],
    ['M.S. in Data Science', 4],
    ['Ph.D. in Physics', 5],
  ])('reads %s as level %i', (text, level) => {
    expect(degreeLevelsIn(text)).toEqual([level]);
  });

  it('finds no degree in plain skill text', () => {
    expect(degreeLevelsIn('Skilled with Excel and Word')).toEqual([]);
  });
});

describe('matchDegree', () => {
  it('B.S. satisfies an associate requirement', () => {
    expect(matchDegree(req('Associate degree'), [degree('B.S. in Biology')])).toEqual({
      requirementId: 'r',
      status: 'full',
      atomIds: ['deg'],
    });
  });

  it('BSN satisfies a bachelor requirement', () => {
    expect(matchDegree(req("Bachelor's degree"), [degree('BSN')]).status).toBe('full');
  });

  it('MBA satisfies a bachelor requirement', () => {
    expect(matchDegree(req("Bachelor's degree"), [degree('MBA')]).status).toBe('full');
  });

  it('an associate degree does not satisfy a bachelor requirement', () => {
    const match = matchDegree(req("Bachelor's degree"), [degree('A.A.S. in Nursing')]);
    expect(match.status).toBe('gap_unverified');
    expect(match.atomIds).toEqual([]);
    expect(match.consideredAtomIds).toEqual(['deg']);
  });

  it('is a gap with no candidates when the profile has no education', () => {
    expect(matchDegree(req("Bachelor's degree"), [job]).status).toBe('gap_no_candidates');
  });

  it('is partial when the named field is not mentioned by the degree', () => {
    const match = matchDegree(req("Bachelor's degree in Marketing or a related field"), [degree('B.S. in Biology')]);
    expect(match.status).toBe('partial');
    expect(match.atomIds).toEqual(['deg']);
  });

  it('is full when the degree names one of the allowed fields', () => {
    const match = matchDegree(req("Bachelor's degree in Marketing or Business"), [degree('B.A. in Business Administration')]);
    expect(match.status).toBe('full');
  });

  it('BSN counts as nursing for a nursing requirement', () => {
    expect(matchDegree(req('Bachelor of Science in Nursing'), [degree('BSN')]).status).toBe('full');
  });

  it('"or equivalent experience" is never a hard gap when experience exists', () => {
    const match = matchDegree(req("Bachelor's degree or equivalent work experience"), [degree('A.A.'), job]);
    expect(match).toEqual({ requirementId: 'r', status: 'partial', atomIds: ['job'] });
  });

  it('"or equivalent experience" is still a gap with no experience', () => {
    expect(matchDegree(req("Bachelor's degree or equivalent experience"), []).status).toBe('gap_no_candidates');
  });

  it('a bare "degree" is met by any degree', () => {
    expect(matchDegree(req('A degree'), [degree('A.S.')]).status).toBe('full');
  });

  it("\"Bachelor's or Master's\" needs only the lower level", () => {
    expect(matchDegree(req("Bachelor's or Master's degree"), [degree('B.S.')]).status).toBe('full');
  });
});
