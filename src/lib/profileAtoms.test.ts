// What this file is: unit tests for buildProfileAtoms -- confirms each
// profile section is indexed into atoms with the right source/label, blank
// entries are skipped, and ids are stable across re-derivation.
// In plain terms: tests proving the profile gets broken down into evidence
// pieces correctly.

import { describe, expect, it } from 'vitest';
import { buildProfileAtoms } from './profileAtoms';
import { emptyProfile } from './profileStore';
import type { Profile } from '../types';

function profile(overrides: Partial<Profile>): Profile {
  return { ...emptyProfile(), ...overrides };
}

describe('buildProfileAtoms', () => {
  it('indexes the summary as one Summary atom', () => {
    const atoms = buildProfileAtoms(profile({ summary: '  Accountant moving into project coordination. ' }));
    expect(atoms).toEqual([
      expect.objectContaining({ source: 'additional', sourceLabel: 'Summary', text: 'Accountant moving into project coordination.' }),
    ]);
  });

  it('indexes one atom per skill, labeled with its category', () => {
    const atoms = buildProfileAtoms(
      profile({ skills: [{ category: 'Languages', items: ['Java', 'TypeScript'] }] }),
    );
    expect(atoms).toEqual([
      expect.objectContaining({ source: 'skills', sourceLabel: 'Skills: Languages', text: 'Java' }),
      expect.objectContaining({ source: 'skills', sourceLabel: 'Skills: Languages', text: 'TypeScript' }),
    ]);
  });

  it('keeps skills in separate categories distinct', () => {
    const atoms = buildProfileAtoms(
      profile({
        skills: [
          { category: 'Languages', items: ['Java'] },
          { category: 'Tools', items: ['Docker'] },
        ],
      }),
    );
    expect(atoms.map((a) => a.sourceLabel)).toEqual(['Skills: Languages', 'Skills: Tools']);
  });

  it('labels experience bullets with role and company', () => {
    const atoms = buildProfileAtoms(
      profile({
        experience: [
          {
            company: 'Acme Co',
            title: 'Software Engineering Intern',
            current: false,
            bullets: ['Built a thing', 'Shipped another thing'],
          },
        ],
      }),
    );
    expect(atoms).toEqual([
      expect.objectContaining({
        source: 'experience',
        sourceLabel: 'Experience: Software Engineering Intern, Acme Co',
        text: 'Built a thing',
      }),
      expect.objectContaining({
        source: 'experience',
        sourceLabel: 'Experience: Software Engineering Intern, Acme Co',
        text: 'Shipped another thing',
      }),
    ]);
  });

  it('indexes project bullets, education details, and additionalInfo', () => {
    const atoms = buildProfileAtoms(
      profile({
        projects: [{ name: 'Widget', description: '', bullets: ['Used React'], links: [] }],
        education: [
          {
            school: 'State U',
            degree: 'BS Computer Science',
            current: false,
            details: ['Dean\'s list'],
          },
        ],
        additionalInfo: ['Won a hackathon'],
      }),
    );
    expect(atoms.map((a) => a.source)).toEqual(['projects', 'education', 'education', 'additional']);
    expect(atoms[0]).toMatchObject({ sourceLabel: 'Project: Widget', text: 'Used React' });
    // The degree line is the first atom of the entry.
    expect(atoms[1]).toMatchObject({ sourceLabel: 'Education: BS Computer Science, State U', text: 'BS Computer Science' });
    expect(atoms[2]).toMatchObject({ sourceLabel: 'Education: BS Computer Science, State U', text: "Dean's list" });
    expect(atoms[3]).toMatchObject({ sourceLabel: 'Additional information', text: 'Won a hackathon' });
  });

  it('adds the field to the degree atom unless the degree already names it', () => {
    const atoms = buildProfileAtoms(
      profile({
        education: [
          { school: 'A', degree: 'B.S.', field: 'Biology', current: false },
          { school: 'B', degree: 'BS Biology', field: 'Biology', current: false },
        ],
      }),
    );
    expect(atoms.map((a) => a.text)).toEqual(['B.S. in Biology', 'BS Biology']);
  });

  it('skips blank entries', () => {
    const atoms = buildProfileAtoms(profile({ skills: [{ category: 'Languages', items: ['Java', '   ', ''] }] }));
    expect(atoms).toHaveLength(1);
  });

  it('produces stable ids across re-derivation of unchanged content', () => {
    const p = profile({ skills: [{ category: 'Languages', items: ['Java'] }] });
    const first = buildProfileAtoms(p);
    const second = buildProfileAtoms(p);
    expect(first[0].id).toBe(second[0].id);
  });

  it('gives distinct ids to duplicate text within the same source', () => {
    const atoms = buildProfileAtoms(profile({ skills: [{ category: 'Languages', items: ['Java', 'Java'] }] }));
    expect(atoms[0].id).not.toBe(atoms[1].id);
  });
});
