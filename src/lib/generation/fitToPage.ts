// What this file is: pure logic for shrinking a generated ResumeContent
// toward one printed page. Decides *what* to cut and in *what order* --
// never *whether* it currently fits, that's a DOM measurement done by the
// caller (see useFitToOnePage.ts). Two-tier removal: whole experience
// entries flagged `prunable` (e.g. "Extra-Curricular Activities") go first,
// oldest-with-no-matched-bullets before oldest-with-matched-bullets, removed
// as a whole entry (not just its bullets); once none are left, falls back to
// trimming unmatched bullets out of core (non-prunable) Experience/Project
// entries, oldest first -- but only ever down to one remaining bullet, never
// to zero, since a non-prunable entry (core Work Experience or a Project) is
// never fully removed and a bare title/company/date line with no bullets at
// all would be pointless. A matched bullet is never removed by either tier.
// In plain terms: figures out which whole extra-curricular activities or
// extra bullets to drop first when a resume runs too long -- extra-curricular
// entries can disappear entirely, a core job or project always keeps at
// least one bullet, and your best (job-matched) content is never touched.

import { MONTHS } from '../../components/ui/primitives';
import type { ExperienceEntry, ProjectEntry, ResumeContent } from '../../types';

export type TrimStep =
  | { kind: 'removeExperienceEntry'; entryIndex: number }
  | { kind: 'removeExperienceBullet'; entryIndex: number; bulletIndex: number }
  | { kind: 'removeProjectBullet'; entryIndex: number; bulletIndex: number };

// Sort key for "how old is this entry's start date" -- larger is newer.
// Entries with no start year, or marked `current`, have nothing meaningful
// to compare so they're treated as the newest (sorted last, i.e. removed
// last).
// In plain terms: turns a start date into a number so entries can be sorted
// oldest-first, with open-ended/undated ones treated as newest.
function startDateKey(entry: ExperienceEntry): number {
  if (entry.current || !entry.startYear) return Infinity;
  const year = Number(entry.startYear);
  const monthIndex = entry.startMonth ? MONTHS.indexOf(entry.startMonth as (typeof MONTHS)[number]) : 0;
  return year * 12 + Math.max(monthIndex, 0);
}

/**
 * Indexes of `prunable` experience entries, ordered for removal: entries
 * with zero matched bullets first (oldest to newest within that group), then
 * entries that do have matched bullets (oldest to newest).
 * In plain terms: the order to drop extra-curricular entries in -- least
 * relevant and oldest first.
 */
export function rankPrunableExperience(experience: ExperienceEntry[], matchedBulletTexts: Set<string>): number[] {
  const candidates = experience
    .map((entry, index) => ({
      index,
      hasMatch: entry.bullets.some((b) => matchedBulletTexts.has(b)),
      dateKey: startDateKey(entry),
    }))
    .filter((c) => experience[c.index].prunable);

  return candidates
    .sort((a, b) => Number(a.hasMatch) - Number(b.hasMatch) || a.dateKey - b.dateKey)
    .map((c) => c.index);
}

function lastUnmatchedBulletIndex(bullets: string[], matchedBulletTexts: Set<string>): number {
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (!matchedBulletTexts.has(bullets[i])) return i;
  }
  return -1;
}

/**
 * The single next cut to try shrinking `content` toward one page, or `null`
 * if nothing more can be cut. Order: whole prunable experience entries (see
 * rankPrunableExperience) go first and are removed outright; then unmatched
 * bullets from the oldest non-prunable experience entry that has more than
 * one bullet left, then unmatched bullets from the lowest-ranked (last)
 * included project that has more than one bullet left. Never removes a
 * matched bullet, a non-prunable experience entry, or a project entry -- and
 * never trims a non-prunable entry's own bullets down past one, so a core
 * job or project is never left as a bare header with nothing under it.
 * In plain terms: "what's the next least-important thing to remove" if the
 * resume is still too long.
 */
export function nextTrim(content: ResumeContent, matchedBulletTexts: Set<string>): TrimStep | null {
  const prunableOrder = rankPrunableExperience(content.experience, matchedBulletTexts);
  if (prunableOrder.length > 0) {
    return { kind: 'removeExperienceEntry', entryIndex: prunableOrder[0] };
  }

  const coreExperience = content.experience
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.prunable)
    .sort((a, b) => startDateKey(a.entry) - startDateKey(b.entry));

  for (const { entry, index } of coreExperience) {
    if (entry.bullets.length <= 1) continue;
    const bulletIndex = lastUnmatchedBulletIndex(entry.bullets, matchedBulletTexts);
    if (bulletIndex !== -1) {
      return { kind: 'removeExperienceBullet', entryIndex: index, bulletIndex };
    }
  }

  for (let index = content.projects.length - 1; index >= 0; index--) {
    if (content.projects[index].bullets.length <= 1) continue;
    const bulletIndex = lastUnmatchedBulletIndex(content.projects[index].bullets, matchedBulletTexts);
    if (bulletIndex !== -1) {
      return { kind: 'removeProjectBullet', entryIndex: index, bulletIndex };
    }
  }

  return null;
}

/**
 * Applies one TrimStep to `content`, returning a new ResumeContent (never
 * mutates the input).
 * In plain terms: actually performs the cut nextTrim decided on.
 */
export function applyTrim(content: ResumeContent, step: TrimStep): ResumeContent {
  if (step.kind === 'removeExperienceEntry') {
    return { ...content, experience: content.experience.filter((_, i) => i !== step.entryIndex) };
  }
  if (step.kind === 'removeExperienceBullet') {
    const experience: ExperienceEntry[] = content.experience.map((entry, i) =>
      i === step.entryIndex ? { ...entry, bullets: entry.bullets.filter((_, j) => j !== step.bulletIndex) } : entry,
    );
    return { ...content, experience };
  }
  const projects: ProjectEntry[] = content.projects.map((entry, i) =>
    i === step.entryIndex ? { ...entry, bullets: entry.bullets.filter((_, j) => j !== step.bulletIndex) } : entry,
  );
  return { ...content, projects };
}
