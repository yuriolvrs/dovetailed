// What this file is: small helper functions for loading and saving the
// single user profile to Dexie's `profiles` table.
// In plain terms: the code that reads and saves your profile info to your
// browser's storage.

import { db } from './db';
import { buildProfileAtoms } from './profileAtoms';
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

// Whether the profile has anything a job posting can be matched against.
// Matching only reads profile atoms (skills, bullets, education details,
// additional info), so a job or project with no bullets doesn't count. Used
// to gate the "Analyze" action so a profile with no evidence can't be sent
// to the LLM (it would only ever produce gaps, never matches).
// In plain terms: checks whether your profile has anything a job can
// actually be matched against.
export function hasProfileContent(profile: Profile): boolean {
  // A degree line is an atom too (for degree requirements), but it alone is
  // not evidence, so it does not count here; education details still do.
  const hasEducationDetail = profile.education.some((e) => (e.details ?? []).some((d) => d.trim() !== ''));
  return buildProfileAtoms(profile).some((a) => a.source !== 'education') || hasEducationDetail;
}

// Whether a job or project has at least one non-blank bullet. Bullets are the
// only part of an entry that matching reads (see profileAtoms.ts).
// In plain terms: does this job or project have any highlights written yet?
export function hasBullets(entry: { bullets: string[] }): boolean {
  return entry.bullets.some((bullet) => bullet.trim() !== '');
}

// Equally-weighted checks for the completeness meter shown on the Profile
// page. They track what tailoring needs, so "missing" can double as a punch
// list of what to fill in next. Highlights counts bullets, not entries: a job
// with no bullets gives matching nothing to use. Projects and education are
// optional, so neither is required here.
// In plain terms: the things that count toward the "N% complete" meter.
const COMPLETENESS_CHECKS: { label: string; done: (profile: Profile) => boolean }[] = [
  { label: 'Name', done: (p) => p.contact.name.trim() !== '' },
  { label: 'Email', done: (p) => p.contact.email.trim() !== '' },
  { label: 'Skills', done: (p) => p.skills.some((group) => group.items.length > 0) },
  { label: 'Highlights', done: (p) => p.experience.some(hasBullets) || p.projects.some(hasBullets) },
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
