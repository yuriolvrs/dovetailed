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
