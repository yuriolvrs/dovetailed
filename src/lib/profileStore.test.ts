// What this file is: unit tests for normalizeSkills -- the migration logic
// that coerces whatever shape skills were saved in (an old flat string list,
// or today's category-grouped shape) into today's SkillGroup[] shape on
// load. Real data-safety stakes here: existing users already have flat
// skills lists saved from before categories were reintroduced.
// In plain terms: tests proving old saved skill lists load correctly under
// the new category-grouped shape.

import { describe, expect, it } from 'vitest';
import { computeProfileCompleteness, emptyProfile, hasProfileContent, normalizeSkills } from './profileStore';

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
    expect(missing).toEqual(['Name', 'Email', 'Skills', 'Highlights']);
  });

  it('is 100% once every check passes', () => {
    const profile = {
      ...emptyProfile(),
      contact: { name: 'Alex', email: 'alex@example.com', links: [] },
      skills: [{ category: 'Skills', items: ['TypeScript'] }],
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          current: true,
          bullets: ['Shipped the billing rewrite'],
        },
      ],
    };
    const { percent, missing } = computeProfileCompleteness(profile);
    expect(percent).toBe(100);
    expect(missing).toEqual([]);
  });

  it('rounds and lists only the checks that failed for a partial profile', () => {
    const profile = {
      ...emptyProfile(),
      contact: { name: 'Alex', email: '', links: [] },
    };
    const { percent, missing } = computeProfileCompleteness(profile);
    // 1 of 4 checks pass (Name) -> 25%.
    expect(percent).toBe(25);
    expect(missing).toEqual(['Email', 'Skills', 'Highlights']);
  });

  it('does not count a job or project with no bullets as highlights', () => {
    const profile = {
      ...emptyProfile(),
      experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: ['  '] }],
      projects: [{ name: 'Project', description: 'A thing', bullets: [], links: [] }],
    };
    expect(computeProfileCompleteness(profile).missing).toContain('Highlights');
  });

  it('counts project bullets alone as highlights', () => {
    const profile = {
      ...emptyProfile(),
      projects: [{ name: 'Project', description: '', bullets: ['Built a parser'], links: [] }],
    };
    expect(computeProfileCompleteness(profile).missing).not.toContain('Highlights');
  });
});

describe('hasProfileContent', () => {
  it('is false when entries exist but none has anything matching can read', () => {
    const profile = {
      ...emptyProfile(),
      experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: [] }],
      education: [{ school: 'U', degree: 'BS', current: false }],
    };
    expect(hasProfileContent(profile)).toBe(false);
  });

  it('is true once there is a bullet or a skill', () => {
    expect(
      hasProfileContent({
        ...emptyProfile(),
        experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: ['Shipped it'] }],
      }),
    ).toBe(true);
    expect(hasProfileContent({ ...emptyProfile(), skills: [{ category: 'Skills', items: ['Go'] }] })).toBe(true);
  });
});
