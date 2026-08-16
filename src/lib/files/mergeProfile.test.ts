// What this file is: unit tests for merging an extracted resume into an
// existing profile -- proving the merge never silently destroys or duplicates
// data, and that duplicate detection tolerates the wording differences an AI
// transcription introduces.
// In plain terms: tests that importing a resume adds to your profile safely.

import { describe, expect, it } from 'vitest';
import type { Profile } from '../../types';
import type { ExtractedProfile } from '../../prompts/extractProfile';
import { findDuplicates, mergeProfile } from './mergeProfile';

function baseProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'default',
    contact: { name: 'Existing Name', email: 'me@example.com', links: [] },
    skills: [{ category: 'Languages', items: ['TypeScript'] }],
    experience: [
      {
        company: 'Acme Bank',
        title: 'Account Officer',
        startMonth: 'March',
        startYear: '2019',
        current: false,
        bullets: ['Original bullet'],
      },
    ],
    projects: [],
    education: [],
    writingSamples: ['keep me'],
    additionalInfo: ['keep me too'],
    ...overrides,
  };
}

function extraction(overrides: Partial<ExtractedProfile> = {}): ExtractedProfile {
  return { contact: {}, skills: [], experience: [], projects: [], education: [], ...overrides };
}

describe('findDuplicates', () => {
  it('matches an entry retyped with different case and spacing', () => {
    const hits = findDuplicates(
      baseProfile(),
      extraction({
        experience: [
          {
            company: 'ACME  Bank',
            title: 'account officer',
            startMonth: 'March',
            startYear: '2019',
            bullets: [],
          },
        ],
      }),
    );
    expect(hits).toEqual([{ section: 'experience', extractedIndex: 0, existingIndex: 0 }]);
  });

  it('does not match a different role at the same company', () => {
    const hits = findDuplicates(
      baseProfile(),
      extraction({
        experience: [
          { company: 'Acme Bank', title: 'Branch Manager', startMonth: 'March', startYear: '2019', bullets: [] },
        ],
      }),
    );
    expect(hits).toEqual([]);
  });
});

describe('mergeProfile', () => {
  it('leaves unselected sections byte-identical', () => {
    const existing = baseProfile();
    const merged = mergeProfile(
      existing,
      extraction({
        skills: [{ category: 'Tools', items: ['Figma'] }],
        experience: [{ company: 'New Co', title: 'Engineer', bullets: [] }],
      }),
      ['skills'],
    );

    expect(merged.experience).toBe(existing.experience);
    expect(merged.writingSamples).toBe(existing.writingSamples);
    expect(merged.skills).toHaveLength(2);
  });

  it('appends by default and never drops an existing entry', () => {
    const existing = baseProfile();
    const merged = mergeProfile(
      existing,
      extraction({ experience: [{ company: 'New Co', title: 'Engineer', bullets: ['New bullet'] }] }),
      ['experience'],
    );

    expect(merged.experience).toHaveLength(2);
    expect(merged.experience[0]).toEqual(existing.experience[0]);
    expect(merged.experience[1].company).toBe('New Co');
    expect(merged.experience[1].current).toBe(false);
  });

  it('appends a duplicate too, unless told otherwise', () => {
    const dupe = extraction({
      experience: [
        { company: 'Acme Bank', title: 'Account Officer', startMonth: 'March', startYear: '2019', bullets: ['Rewritten'] },
      ],
    });
    expect(mergeProfile(baseProfile(), dupe, ['experience']).experience).toHaveLength(2);
  });

  it('replaces in place when the duplicate is resolved as replace', () => {
    const merged = mergeProfile(
      baseProfile(),
      extraction({
        experience: [
          {
            company: 'Acme Bank',
            title: 'Account Officer',
            startMonth: 'March',
            startYear: '2019',
            bullets: ['Replacement bullet'],
          },
        ],
      }),
      ['experience'],
      { 'experience.0': 'replace' },
    );

    expect(merged.experience).toHaveLength(1);
    expect(merged.experience[0].bullets).toEqual(['Replacement bullet']);
  });

  it('skips an entry resolved as skip', () => {
    const merged = mergeProfile(
      baseProfile(),
      extraction({ experience: [{ company: 'New Co', title: 'Engineer', bullets: [] }] }),
      ['experience'],
      { 'experience.0': 'skip' },
    );
    expect(merged.experience).toHaveLength(1);
  });

  it('never overwrites a contact field the user already filled', () => {
    const merged = mergeProfile(
      baseProfile(),
      extraction({ contact: { name: 'Parsed Name', email: 'parsed@example.com', phone: '555-1234' } }),
      ['contact'],
    );

    expect(merged.contact.name).toBe('Existing Name');
    expect(merged.contact.email).toBe('me@example.com');
    // Only the field that was empty gets filled.
    expect(merged.contact.phone).toBe('555-1234');
  });

  it('folds skills into an existing category instead of duplicating it', () => {
    const merged = mergeProfile(
      baseProfile(),
      extraction({ skills: [{ category: 'languages', items: ['TypeScript', 'Python'] }] }),
      ['skills'],
    );

    expect(merged.skills).toHaveLength(1);
    expect(merged.skills[0].items).toEqual(['TypeScript', 'Python']);
  });

  it('gives imported projects the empty links a resume cannot supply', () => {
    const merged = mergeProfile(
      baseProfile(),
      extraction({ projects: [{ name: 'Thing', description: 'Does stuff', bullets: [] }] }),
      ['projects'],
    );
    expect(merged.projects[0].links).toEqual([]);
  });

  it('behaves as a plain import on an empty profile', () => {
    const empty = baseProfile({ contact: { name: '', email: '', links: [] }, skills: [], experience: [] });
    const merged = mergeProfile(
      empty,
      extraction({
        contact: { name: 'Parsed Name' },
        skills: [{ category: 'Languages', items: ['Go'] }],
        experience: [{ company: 'New Co', title: 'Engineer', bullets: [] }],
      }),
      ['contact', 'skills', 'experience'],
    );

    expect(merged.contact.name).toBe('Parsed Name');
    expect(merged.skills).toEqual([{ category: 'Languages', items: ['Go'] }]);
    expect(merged.experience).toHaveLength(1);
  });
});
