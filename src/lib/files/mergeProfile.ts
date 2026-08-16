// What this file is: merges an extracted profile into the user's existing
// one. Never destructive on its own -- list sections append, contact fills
// only-empty fields, and anything that looks like an entry already present is
// reported so the review screen can offer Replace/Skip instead of silently
// creating a second copy.
// In plain terms: adds what was read from your resume to your profile without
// throwing away or duplicating what's already there.

import type { EducationEntry, ExperienceEntry, Profile, ProjectEntry, SkillGroup } from '../../types';
import type {
  ExtractedEducation,
  ExtractedExperience,
  ExtractedProfile,
  ExtractedProject,
} from '../../prompts/extractProfile';
import { educationKey, experienceKey, projectKey } from '../resumeEntryKeys';
import { normalizeForCompare } from './verifyExtraction';

export type SectionKey = 'contact' | 'skills' | 'experience' | 'projects' | 'education';

export type DuplicateAction = 'append' | 'replace' | 'skip';

export interface DuplicateHit {
  section: Exclude<SectionKey, 'contact' | 'skills'>;
  extractedIndex: number;
  existingIndex: number;
}

/** Key for a resolution map entry, e.g. "experience.2". */
export function resolutionKey(section: string, extractedIndex: number): string {
  return `${section}.${extractedIndex}`;
}

// The shared entry keys are exact-match by design (they identify the same
// object across two in-app copies). An imported entry is retyped by an AI
// from a PDF, so it needs the same key compared loosely -- case, spacing and
// punctuation differences shouldn't hide a duplicate.
function loose(key: string): string {
  return normalizeForCompare(key);
}

function findIndexByKey<T>(list: T[], keyOf: (item: T) => string, target: string): number {
  const wanted = loose(target);
  return list.findIndex((item) => loose(keyOf(item)) === wanted);
}

/**
 * Reports extracted entries that match one already in the profile, before any
 * merge happens, so the user can decide what to do with each.
 * In plain terms: spots "you already have this job listed" cases.
 */
export function findDuplicates(existing: Profile, extracted: ExtractedProfile): DuplicateHit[] {
  const hits: DuplicateHit[] = [];

  extracted.experience?.forEach((entry, extractedIndex) => {
    const existingIndex = findIndexByKey(existing.experience, experienceKey, experienceKey(toExperience(entry)));
    if (existingIndex !== -1) hits.push({ section: 'experience', extractedIndex, existingIndex });
  });

  extracted.projects?.forEach((entry, extractedIndex) => {
    const existingIndex = findIndexByKey(existing.projects, projectKey, projectKey(toProject(entry)));
    if (existingIndex !== -1) hits.push({ section: 'projects', extractedIndex, existingIndex });
  });

  extracted.education?.forEach((entry, extractedIndex) => {
    const existingIndex = findIndexByKey(existing.education, educationKey, educationKey(toEducation(entry)));
    if (existingIndex !== -1) hits.push({ section: 'education', extractedIndex, existingIndex });
  });

  return hits;
}

// Fills the fields a resume can't supply: a project's links (a resume lists
// no URLs we can attribute reliably) and "current" (only true when the
// document said so).
function toExperience(entry: ExtractedExperience): ExperienceEntry {
  return { ...entry, current: entry.current ?? false };
}

function toProject(entry: ExtractedProject): ProjectEntry {
  return { ...entry, links: [] };
}

function toEducation(entry: ExtractedEducation): EducationEntry {
  return { ...entry, current: entry.current ?? false };
}

// Applies each extracted entry according to its resolution: replace the
// matching entry in place (preserving position), skip it, or append. Anything
// without an explicit resolution appends, so the default can never destroy
// existing data.
function mergeList<T>(
  existingList: T[],
  extractedList: T[],
  section: string,
  duplicates: DuplicateHit[],
  resolutions: Record<string, DuplicateAction>,
): T[] {
  const result = [...existingList];

  extractedList.forEach((entry, extractedIndex) => {
    const action = resolutions[resolutionKey(section, extractedIndex)] ?? 'append';
    if (action === 'skip') return;

    if (action === 'replace') {
      const hit = duplicates.find((d) => d.section === section && d.extractedIndex === extractedIndex);
      if (hit) {
        result[hit.existingIndex] = entry;
        return;
      }
    }
    result.push(entry);
  });

  return result;
}

// Skill categories merge by name: an imported "Languages" group folds its new
// items into an existing "Languages" rather than creating a second one, and
// an item already present is not duplicated.
function mergeSkills(existing: SkillGroup[], extracted: SkillGroup[]): SkillGroup[] {
  const result = existing.map((group) => ({ ...group, items: [...group.items] }));

  for (const group of extracted) {
    const target = result.find((g) => loose(g.category) === loose(group.category));
    if (!target) {
      result.push({ category: group.category, items: [...group.items] });
      continue;
    }
    for (const item of group.items) {
      if (!target.items.some((existingItem) => loose(existingItem) === loose(item))) {
        target.items.push(item);
      }
    }
  }

  return result;
}

/**
 * Produces the profile that importing would result in. Only the listed
 * sections are touched; everything else is returned unchanged.
 * In plain terms: works out what your profile would look like after the
 * import, without saving anything yet.
 */
export function mergeProfile(
  existing: Profile,
  extracted: ExtractedProfile,
  sections: SectionKey[],
  resolutions: Record<string, DuplicateAction> = {},
): Profile {
  const selected = new Set(sections);
  const duplicates = findDuplicates(existing, extracted);
  const merged: Profile = { ...existing };

  if (selected.has('contact')) {
    // Fill only what's empty -- a value the user already typed always wins.
    const c = extracted.contact ?? {};
    merged.contact = {
      ...existing.contact,
      name: existing.contact.name?.trim() || c.name || existing.contact.name,
      email: existing.contact.email?.trim() || c.email || existing.contact.email,
      phone: existing.contact.phone?.trim() || c.phone || existing.contact.phone,
      location: existing.contact.location?.trim() || c.location || existing.contact.location,
    };
  }

  if (selected.has('skills')) {
    merged.skills = mergeSkills(existing.skills, extracted.skills ?? []);
  }

  if (selected.has('experience')) {
    merged.experience = mergeList<ExperienceEntry>(
      existing.experience,
      (extracted.experience ?? []).map(toExperience),
      'experience',
      duplicates,
      resolutions,
    );
  }

  if (selected.has('projects')) {
    merged.projects = mergeList<ProjectEntry>(
      existing.projects,
      (extracted.projects ?? []).map(toProject),
      'projects',
      duplicates,
      resolutions,
    );
  }

  if (selected.has('education')) {
    merged.education = mergeList<EducationEntry>(
      existing.education,
      (extracted.education ?? []).map(toEducation),
      'education',
      duplicates,
      resolutions,
    );
  }

  return merged;
}
