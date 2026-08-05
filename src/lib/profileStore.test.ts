// What this file is: unit tests for normalizeSkills -- the migration logic
// that coerces whatever shape skills were saved in (an old flat string list,
// or today's category-grouped shape) into today's SkillGroup[] shape on
// load. Real data-safety stakes here: existing users already have flat
// skills lists saved from before categories were reintroduced.
// In plain terms: tests proving old saved skill lists load correctly under
// the new category-grouped shape.

import { describe, expect, it } from 'vitest';
import { computeProfileCompleteness, emptyProfile, normalizeSkills } from './profileStore';

describe('normalizeSkills', () => {
  it('wraps an old flat string list into one "Skills" category', () => {
    expect(normalizeSkills(['Java', 'TypeScript'])).toEqual([{ category: 'Skills', items: ['Java', 'TypeScript'] }]);
  });

  it('drops blank entries from an old flat string list', () => {
    expect(normalizeSkills(['Java', '  ', ''])).toEqual([{ category: 'Skills', items: ['Java'] }]);
  });

  it('returns an empty array for an empty or all-blank flat list', () => {
    expect(normalizeSkills([])).toEqual([]);
    expect(normalizeSkills(['', '  '])).toEqual([]);
  });

  it('passes through an already-grouped shape unchanged', () => {
    const grouped = [{ category: 'Languages', items: ['Java', 'Python'] }];
    expect(normalizeSkills(grouped)).toEqual(grouped);
  });

  it('filters non-string items out of a group and defaults a missing category', () => {
    const malformed = [{ category: 42, items: ['Java', 7, null] }];
    expect(normalizeSkills(malformed)).toEqual([{ category: '', items: ['Java'] }]);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeSkills(null)).toEqual([]);
    expect(normalizeSkills(undefined)).toEqual([]);
    expect(normalizeSkills('nope')).toEqual([]);
  });
});

describe('computeProfileCompleteness', () => {
  it('is 0% for a brand-new empty profile, missing every check', () => {
    const { percent, missing } = computeProfileCompleteness(emptyProfile());
    expect(percent).toBe(0);
    expect(missing).toEqual(['Name', 'Email', 'Summary', 'Skills', 'Work Experience', 'Projects', 'Education']);
  });

  it('is 100% once every check passes', () => {
    const profile = {
      ...emptyProfile(),
      contact: { name: 'Alex', email: 'alex@example.com', links: [] },
      summary: 'Engineer.',
      skills: [{ category: 'Skills', items: ['TypeScript'] }],
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          current: true,
          bullets: [],
        },
      ],
      projects: [{ name: 'Project', description: '', bullets: [], links: [] }],
      education: [{ school: 'U', degree: 'BS', current: false }],
    };
    const { percent, missing } = computeProfileCompleteness(profile);
    expect(percent).toBe(100);
    expect(missing).toEqual([]);
  });

  it('rounds and lists only the checks that failed for a partial profile', () => {
    const profile = {
      ...emptyProfile(),
      contact: { name: 'Alex', email: '', links: [] },
      summary: 'Engineer.',
    };
    const { percent, missing } = computeProfileCompleteness(profile);
    // 2 of 7 checks pass (Name, Summary) -> 2/7 rounds to 29%.
    expect(percent).toBe(29);
    expect(missing).toEqual(['Email', 'Skills', 'Work Experience', 'Projects', 'Education']);
  });
});
