// What this file is: indexes a Profile into discrete, quotable ProfileAtoms
// (one per skill/bullet/detail) so job matching can reference evidence by ID
// instead of generating free-typed text that has to be verified after the
// fact. Atoms are derived on demand from the profile, not persisted
// separately -- the profile is already the single source of truth, so
// re-deriving avoids any risk of atoms drifting out of sync with it.
// In plain terms: breaks your profile down into small labeled pieces of
// evidence (one skill, one bullet point, etc.) that job matching can point
// to directly.

import type { EducationEntry, ExperienceEntry, Profile, ProjectEntry, ProfileAtom } from '../types';

function atomId(source: string, text: string): string {
  // Simple deterministic string hash (FNV-1a), stable across re-derivation
  // as long as the source+text is unchanged; no crypto needed for this.
  let hash = 0x811c9dc5;
  const input = `${source}:${text}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${source}-${(hash >>> 0).toString(36)}`;
}

function dedupeIds(atoms: ProfileAtom[]): ProfileAtom[] {
  // Two atoms can hash to the same id only if source+text are identical;
  // suffix duplicates so ids stay unique within the returned list.
  const seen = new Map<string, number>();
  return atoms.map((atom) => {
    const count = seen.get(atom.id) ?? 0;
    seen.set(atom.id, count + 1);
    return count === 0 ? atom : { ...atom, id: `${atom.id}-${count}` };
  });
}

// Exported so callers that need to map an atom back to the specific profile
// entry it came from (e.g. resume generation grouping bullets by job/project/
// skill category) can recompute the same label instead of duplicating the
// string format.
// In plain terms: the exact label text used for one job, project, or skill category.
export function skillsLabel(category: string): string {
  return `Skills: ${category}`;
}

export function experienceLabel(entry: ExperienceEntry): string {
  return `Experience: ${entry.title}, ${entry.company}`;
}

export function projectLabel(entry: ProjectEntry): string {
  return `Project: ${entry.name}`;
}

function educationLabel(entry: EducationEntry): string {
  return `Education: ${entry.degree}, ${entry.school}`;
}

export function buildProfileAtoms(profile: Profile): ProfileAtom[] {
  const atoms: ProfileAtom[] = [];

  for (const group of profile.skills) {
    const label = skillsLabel(group.category);
    for (const skill of group.items) {
      if (skill.trim() === '') continue;
      atoms.push({ id: atomId('skills', skill), source: 'skills', sourceLabel: label, text: skill });
    }
  }

  for (const entry of profile.experience) {
    const label = experienceLabel(entry);
    for (const bullet of entry.bullets) {
      if (bullet.trim() === '') continue;
      atoms.push({ id: atomId('experience', bullet), source: 'experience', sourceLabel: label, text: bullet });
    }
  }

  for (const entry of profile.projects) {
    const label = projectLabel(entry);
    for (const bullet of entry.bullets) {
      if (bullet.trim() === '') continue;
      atoms.push({ id: atomId('projects', bullet), source: 'projects', sourceLabel: label, text: bullet });
    }
  }

  for (const entry of profile.education) {
    const label = educationLabel(entry);
    // The degree line itself is the first atom of the entry, so a degree
    // requirement can cite it (see lib/matching/degreeMatch.ts).
    const degree = entry.degree.trim();
    if (degree !== '') {
      const field = entry.field?.trim();
      const text = field && !degree.toLowerCase().includes(field.toLowerCase()) ? `${degree} in ${field}` : degree;
      atoms.push({ id: atomId('education', text), source: 'education', sourceLabel: label, text });
    }
    for (const detail of entry.details ?? []) {
      if (detail.trim() === '') continue;
      atoms.push({ id: atomId('education', detail), source: 'education', sourceLabel: label, text: detail });
    }
  }

  for (const info of profile.additionalInfo) {
    if (info.trim() === '') continue;
    atoms.push({ id: atomId('additional', info), source: 'additional', sourceLabel: 'Additional information', text: info });
  }

  return dedupeIds(atoms);
}
