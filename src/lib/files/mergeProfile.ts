// What this file is: merges an extracted profile into the user's existing
// one. Never destructive on its own -- list sections append, contact fills
// only-empty fields, and anything that looks like an entry already present is
// reported so the review screen can offer Replace/Skip instead of silently
// creating a second copy.
// In plain terms: adds what was read from your resume to your profile without
// throwing away or duplicating what's already there.

import type { ContactLink, EducationEntry, ExperienceEntry, Profile, ProjectEntry, SkillGroup } from '../../types';
import type {
  ExtractedEducation,
  ExtractedExperience,
  ExtractedProfile,
  ExtractedProject,
} from '../../prompts/extractProfile';
import { normalizeForCompare } from './verifyExtraction';

export type SectionKey = 'contact' | 'skills' | 'experience' | 'projects' | 'education';

export type DuplicateAction = 'append' | 'replace' | 'skip' | 'combine';

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

// What makes an imported entry "the same" as one already in the profile.
// Looser than the editor's entry keys on purpose: two resumes, or a resume
// and the profile, often differ in dates ("Present" later becoming a month)
// or in a project's tech-stack line, and those are still the same job or
// project. The user sees each hit and can still choose "Add anyway".
const importExperienceKey = (e: { company: string; title: string }) => `${e.company}|${e.title}`;
const importProjectKey = (p: { name: string }) => p.name;
const importEducationKey = (e: { school: string; degree: string }) => `${e.school}|${e.degree}`;

/**
 * Reports extracted entries that match one already in the profile, before any
 * merge happens, so the user can decide what to do with each.
 * In plain terms: spots "you already have this job listed" cases.
 */
export function findDuplicates(existing: Profile, extracted: ExtractedProfile): DuplicateHit[] {
  const hits: DuplicateHit[] = [];

  extracted.experience?.forEach((entry, extractedIndex) => {
    const existingIndex = findIndexByKey(existing.experience, importExperienceKey, importExperienceKey(entry));
    if (existingIndex !== -1) hits.push({ section: 'experience', extractedIndex, existingIndex });
  });

  extracted.projects?.forEach((entry, extractedIndex) => {
    const existingIndex = findIndexByKey(existing.projects, importProjectKey, importProjectKey(entry));
    if (existingIndex !== -1) hits.push({ section: 'projects', extractedIndex, existingIndex });
  });

  extracted.education?.forEach((entry, extractedIndex) => {
    const existingIndex = findIndexByKey(existing.education, importEducationKey, importEducationKey(entry));
    if (existingIndex !== -1) hits.push({ section: 'education', extractedIndex, existingIndex });
  });

  return hits;
}

const KNOWN_LINK_LABELS: Record<string, string> = {
  'linkedin.com': 'LinkedIn',
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
};

/**
 * Turns a link as a resume prints it ("github.com/name") into a stored link:
 * a label from the site name, and a URL with "https://" added when the
 * resume left it off, so exported hyperlinks work.
 * In plain terms: makes "github.com/you" into a working GitHub link.
 */
export function toContactLink(text: string): ContactLink {
  const trimmed = text.trim();
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const host = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0].replace(/^www\./i, '').toLowerCase();
  return { label: KNOWN_LINK_LABELS[host] ?? host, url };
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

/**
 * Folds an imported copy of an entry into the user's own: empty text fields
 * are filled from the import, and bullets (or education details) the user
 * does not have yet are added after theirs. Nothing the user wrote is
 * changed or removed. Made for importing several resumes that list the same
 * job with different bullets.
 * In plain terms: keeps your version of the job and adds any new bullets
 * from the other resume.
 */
export function combineEntries<T extends object>(mine: T, incoming: T): T {
  const result = { ...mine } as Record<string, unknown>;
  for (const [key, value] of Object.entries(incoming)) {
    const current = result[key];
    if (typeof value === 'string') {
      if ((current === undefined || current === '') && value.trim()) result[key] = value;
    } else if (Array.isArray(value) && (key === 'bullets' || key === 'details')) {
      const list = Array.isArray(current) ? [...(current as string[])] : [];
      for (const item of value) {
        if (typeof item === 'string' && item.trim() && !list.some((have) => loose(have) === loose(item))) {
          list.push(item);
        }
      }
      result[key] = list;
    }
  }
  return result as T;
}

// Applies each extracted entry according to its resolution: replace the
// matching entry in place (preserving position), combine it into the
// matching entry, skip it, or append. Anything without an explicit
// resolution appends, so the default can never destroy existing data.
function mergeList<T extends object>(
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

    if (action === 'replace' || action === 'combine') {
      const hit = duplicates.find((d) => d.section === section && d.extractedIndex === extractedIndex);
      if (hit) {
        result[hit.existingIndex] = action === 'replace' ? entry : combineEntries(result[hit.existingIndex], entry);
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
      // Links fill only when the user has none, like the single fields above.
      links: existing.contact.links.some((l) => l.url.trim())
        ? existing.contact.links
        : (c.links ?? []).filter((l) => l.trim()).map(toContactLink),
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
