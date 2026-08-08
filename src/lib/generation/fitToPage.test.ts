// What this file is: unit tests for the one-page trimming order -- confirms
// prunable entries go before core content, no-match-before-matched within
// prunable entries, oldest-first within each group, and that a matched
// bullet is never removed by either tier.
// In plain terms: tests proving the "what to cut first when the resume runs
// long" logic drops the least useful, oldest content first and never touches
// content matched to the job.

import { describe, expect, it } from 'vitest';
import { applyTrim, nextTrim, rankPrunableExperience } from './fitToPage';
import type { ExperienceEntry, ProjectEntry, ResumeContent } from '../../types';

function exp(overrides: Partial<ExperienceEntry>): ExperienceEntry {
  return { company: 'Co', title: 'Role', current: false, bullets: [], ...overrides };
}

function proj(overrides: Partial<ProjectEntry>): ProjectEntry {
  return { name: 'Proj', description: '', bullets: [], links: [], ...overrides };
}

function content(experience: ExperienceEntry[], projects: ProjectEntry[] = []): ResumeContent {
  return {
    contact: { name: '', email: '', links: [] },
    skills: [],
    experience,
    projects,
    education: [],
  };
}

describe('rankPrunableExperience', () => {
  it('ignores non-prunable entries', () => {
    const experience = [exp({ prunable: false, startYear: '2020' }), exp({ prunable: true, startYear: '2019' })];
    expect(rankPrunableExperience(experience, new Set())).toEqual([1]);
  });

  it('puts no-matched-bullet entries before matched ones, each group oldest first', () => {
    const experience = [
      exp({ prunable: true, startYear: '2022', bullets: ['b1'] }), // matched, newer
      exp({ prunable: true, startYear: '2019', bullets: ['b2'] }), // matched, older
      exp({ prunable: true, startYear: '2021', bullets: ['b3'] }), // unmatched, newer
      exp({ prunable: true, startYear: '2018', bullets: ['b4'] }), // unmatched, older
    ];
    const matched = new Set(['b1', 'b2']);
    expect(rankPrunableExperience(experience, matched)).toEqual([3, 2, 1, 0]);
  });

  it('treats current/undated entries as newest (removed last)', () => {
    const experience = [
      exp({ prunable: true, current: true, bullets: [] }),
      exp({ prunable: true, startYear: '2015', bullets: [] }),
    ];
    expect(rankPrunableExperience(experience, new Set())).toEqual([1, 0]);
  });
});

describe('nextTrim / applyTrim', () => {
  it('removes the whole lowest-ranked prunable entry before touching core content', () => {
    const c = content([
      exp({ startYear: '2010', bullets: ['core unmatched'] }),
      exp({ prunable: true, startYear: '2015', bullets: [] }),
    ]);
    const step = nextTrim(c, new Set());
    expect(step).toEqual({ kind: 'removeExperienceEntry', entryIndex: 1 });
    const next = applyTrim(c, step!);
    expect(next.experience).toHaveLength(1);
    expect(next.experience[0].startYear).toBe('2010');
  });

  it('falls back to trimming unmatched bullets from the oldest core entry once no prunable entries remain', () => {
    const c = content([
      exp({ startYear: '2020', bullets: ['newer unmatched'] }),
      exp({ startYear: '2010', bullets: ['older matched', 'older unmatched'] }),
    ]);
    const matched = new Set(['older matched']);
    const step = nextTrim(c, matched);
    expect(step).toEqual({ kind: 'removeExperienceBullet', entryIndex: 1, bulletIndex: 1 });
    const next = applyTrim(c, step!);
    expect(next.experience[1].bullets).toEqual(['older matched']);
  });

  it('never removes a matched bullet', () => {
    const c = content([exp({ startYear: '2010', bullets: ['matched only'] })]);
    const matched = new Set(['matched only']);
    expect(nextTrim(c, matched)).toBeNull();
  });

  it('trims project bullets, lowest-ranked (last) project first, only after experience has nothing left to give', () => {
    const c = content(
      [exp({ startYear: '2010', bullets: ['matched'] })],
      [proj({ name: 'A', bullets: ['a matched'] }), proj({ name: 'B', bullets: ['b unmatched 1', 'b unmatched 2'] })],
    );
    const matched = new Set(['matched', 'a matched']);
    const step = nextTrim(c, matched);
    expect(step).toEqual({ kind: 'removeProjectBullet', entryIndex: 1, bulletIndex: 1 });
  });

  it('returns null when nothing further can be cut', () => {
    const c = content(
      [exp({ startYear: '2010', bullets: ['matched'] })],
      [proj({ name: 'A', bullets: ['a matched'] })],
    );
    const matched = new Set(['matched', 'a matched']);
    expect(nextTrim(c, matched)).toBeNull();
  });

  it('never trims a non-prunable experience entry down to its last bullet, even if unmatched', () => {
    const c = content([exp({ startYear: '2010', bullets: ['only unmatched bullet'] })]);
    // No prunable entries, no matched content -- if the floor didn't apply this would
    // remove the sole bullet and leave a bare title/company/date line.
    expect(nextTrim(c, new Set())).toBeNull();
  });

  it('never trims a project down to its last bullet, even if unmatched', () => {
    const c = content([], [proj({ name: 'A', bullets: ['only unmatched bullet'] })]);
    expect(nextTrim(c, new Set())).toBeNull();
  });

  it('does remove a whole prunable entry down to zero bullets, unlike non-prunable entries', () => {
    const c = content([exp({ prunable: true, startYear: '2010', bullets: ['only unmatched bullet'] })]);
    const step = nextTrim(c, new Set());
    expect(step).toEqual({ kind: 'removeExperienceEntry', entryIndex: 0 });
  });
});
