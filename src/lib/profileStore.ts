// What this file is: small helper functions for loading and saving the
// single user profile to Dexie's `profiles` table.
// In plain terms: the code that reads and saves your profile info to your
// browser's storage.

import { db } from './db';
import type { Profile, SkillGroup } from '../types';

/**
 * v1 supports a single local profile, addressed by a fixed id.
 * In plain terms: there's only ever one profile stored, and this is its id.
 */
export const DEFAULT_PROFILE_ID = 'default';

export function emptyProfile(): Profile {
  return {
    id: DEFAULT_PROFILE_ID,
    contact: { name: '', email: '', links: [] },
    summary: '',
    skills: [],
    experience: [],
    projects: [],
    education: [],
    writingSamples: [],
    additionalInfo: [],
  };
}

// Skills are grouped by category ({ category, items }). Two older shapes
// need normalizing on load: a flat string list (a since-reversed decision to
// flatten categories away), and a grouped shape whose items weren't
// strictly validated. Both are coerced into today's SkillGroup[] shape.
// In plain terms: converts whatever shape skills were saved in (old flat
// list or old grouped format) into today's category-grouped shape.
export function normalizeSkills(skills: unknown): SkillGroup[] {
  if (!Array.isArray(skills)) return [];

  if (skills.every((item) => typeof item === 'string')) {
    const items = skills.filter((item): item is string => item.trim() !== '');
    return items.length > 0 ? [{ category: 'Skills', items }] : [];
  }

  return skills.map((group) => {
    const g = group as { category?: unknown; items?: unknown } | null;
    return {
      category: typeof g?.category === 'string' ? g.category : '',
      items: Array.isArray(g?.items) ? g.items.filter((item): item is string => typeof item === 'string') : [],
    };
  });
}

export async function loadProfile(): Promise<Profile> {
  const existing = await db.profiles.get(DEFAULT_PROFILE_ID);
  if (!existing) return emptyProfile();
  return {
    ...existing,
    skills: normalizeSkills(existing.skills),
    additionalInfo: Array.isArray(existing.additionalInfo) ? existing.additionalInfo : [],
  };
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.profiles.put(profile);
}

// Whether the profile has enough content to be worth comparing against a job
// posting. Used to gate the "Analyze" action so a blank profile can't be sent
// to the LLM (it would only ever produce gaps, never matches).
// In plain terms: checks whether your profile has enough filled in to bother
// analyzing a job against it.
export function hasProfileContent(profile: Profile): boolean {
  return (
    profile.summary.trim() !== '' ||
    profile.skills.some((group) => group.items.length > 0) ||
    profile.experience.length > 0 ||
    profile.projects.length > 0 ||
    profile.education.length > 0
  );
}

// Equally-weighted checks for the completeness meter shown on the Profile
// page -- each corresponds to one of the page's sections, so "missing" can
// double as a punch list of what to fill in next.
// In plain terms: the list of profile sections that count toward the
// "N% complete" meter.
const COMPLETENESS_CHECKS: { label: string; done: (profile: Profile) => boolean }[] = [
  { label: 'Name', done: (p) => p.contact.name.trim() !== '' },
  { label: 'Email', done: (p) => p.contact.email.trim() !== '' },
  { label: 'Summary', done: (p) => p.summary.trim() !== '' },
  { label: 'Skills', done: (p) => p.skills.some((group) => group.items.length > 0) },
  { label: 'Work Experience', done: (p) => p.experience.length > 0 },
  { label: 'Projects', done: (p) => p.projects.length > 0 },
  { label: 'Education', done: (p) => p.education.length > 0 },
];

export interface ProfileCompleteness {
  percent: number;
  missing: string[];
}

/**
 * How much of the profile is filled in, as a rounded percentage plus the
 * labels of whichever checks didn't pass.
 * In plain terms: powers the "Profile X% complete" meter -- how full the
 * profile is, and what's still missing.
 */
export function computeProfileCompleteness(profile: Profile): ProfileCompleteness {
  const missing: string[] = [];
  let doneCount = 0;
  for (const check of COMPLETENESS_CHECKS) {
    if (check.done(profile)) {
      doneCount++;
    } else {
      missing.push(check.label);
    }
  }
  return { percent: Math.round((doneCount / COMPLETENESS_CHECKS.length) * 100), missing };
}
