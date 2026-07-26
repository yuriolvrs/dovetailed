// What this file is: pure, deterministic selection/prioritization logic for
// Phase 4's resume generation -- no LLM call, no rewritten text. Every
// bullet and skill in the output is copied verbatim from the profile; all
// this does is reorder items within each section so ones already confirmed
// as evidence for a requirement (see matching, src/lib/matching/) surface
// first, cap each section to fit a one-page resume, and rank which projects
// to include by how much matched evidence they have. Replaces an earlier
// per-section LLM-rewriting design that was found, from a real generated
// resume, to fabricate content -- e.g. inventing "Developed scalable and
// efficient code using Java and Spring Framework" for an events-organizing
// role, backed only by the word "JavaScript" in additionalInfo. Selection
// instead of generation makes that structurally impossible: nothing here
// can ever say anything the profile doesn't already say.
// In plain terms: picks and orders which of your real accomplishments to
// show for this job, without ever changing their wording.

import type {
  ExperienceEntry,
  JobAnalysis,
  Profile,
  ProfileAtom,
  ProjectEntry,
  ResumeContent,
  SkillGroup,
  SourceMapEntry,
} from '../../types';
import { experienceLabel, projectLabel, skillsLabel } from '../profileAtoms';

// Derived from a one-page LaTeX resume template (Jake's Resume:
// Education/Experience/Projects/Technical Skills, ~3-5 bullets per role, ~4
// per project, two projects shown) -- a fixed heuristic, not a measured
// page-fit.
// In plain terms: how many bullet points and projects we keep per section.
export const EXPERIENCE_BULLET_CAP = 5;
export const PROJECT_BULLET_CAP = 4;
export const MAX_PROJECTS = 2;

function sectionAtomsByText(atoms: ProfileAtom[], label: string): Map<string, ProfileAtom> {
  const map = new Map<string, ProfileAtom>();
  for (const atom of atoms) {
    if (atom.sourceLabel === label) map.set(atom.text, atom);
  }
  return map;
}

/**
 * Reorders items so ones matched to some requirement come first (stable --
 * preserves relative order within each group), capped to `cap`, and records
 * a sourceMap entry for every matched item kept.
 * In plain terms: puts your relevant bullets/skills first, trims the rest.
 */
function prioritize(
  items: string[],
  label: string,
  atoms: ProfileAtom[],
  matchedIds: Set<string>,
  cap: number,
  sourceMap: SourceMapEntry[],
): string[] {
  const index = sectionAtomsByText(atoms, label);
  const withFlags = items.map((item, i) => {
    const atom = index.get(item);
    return { item, i, matched: Boolean(atom && matchedIds.has(atom.id)), atomId: atom?.id };
  });

  const ordered = [...withFlags].sort((a, b) => Number(b.matched) - Number(a.matched) || a.i - b.i).slice(0, cap);

  for (const entry of ordered) {
    if (entry.matched && entry.atomId) {
      sourceMap.push({ generatedText: entry.item, atomIds: [entry.atomId] });
    }
  }

  return ordered.map((entry) => entry.item);
}

function countMatched(items: string[], label: string, atoms: ProfileAtom[], matchedIds: Set<string>): number {
  const index = sectionAtomsByText(atoms, label);
  return items.filter((item) => {
    const atom = index.get(item);
    return atom && matchedIds.has(atom.id);
  }).length;
}

/**
 * Selects and orders resume content for one job posting -- purely from
 * already-real profile text and the matching pass's evidence links, no
 * generation involved. Contact/summary/education are copied verbatim
 * (nothing to select there); skill items and experience/project bullets are
 * reordered and capped per section; projects are ranked by matched-bullet
 * count and capped to MAX_PROJECTS. Every experience entry is always kept
 * (employment history is never hidden), even with zero matched evidence.
 *
 * In plain terms: builds a tailored resume by choosing and ordering your
 * real content for this job, never by writing new content.
 */
export function selectResumeContent(
  profile: Profile,
  analysis: JobAnalysis,
  atoms: ProfileAtom[],
): { content: ResumeContent; sourceMap: SourceMapEntry[] } {
  const matchedIds = new Set(analysis.matches.flatMap((m) => m.atomIds));
  const sourceMap: SourceMapEntry[] = [];

  const experience: ExperienceEntry[] = profile.experience.map((entry) => ({
    ...entry,
    bullets: prioritize(entry.bullets, experienceLabel(entry), atoms, matchedIds, EXPERIENCE_BULLET_CAP, sourceMap),
  }));

  const rankedProjects = profile.projects
    .map((entry, index) => ({
      entry,
      index,
      matchedCount: countMatched(entry.bullets, projectLabel(entry), atoms, matchedIds),
    }))
    .sort((a, b) => b.matchedCount - a.matchedCount || a.index - b.index)
    .slice(0, MAX_PROJECTS)
    .sort((a, b) => a.index - b.index);

  const projects: ProjectEntry[] = rankedProjects.map(({ entry }) => ({
    ...entry,
    bullets: prioritize(entry.bullets, projectLabel(entry), atoms, matchedIds, PROJECT_BULLET_CAP, sourceMap),
  }));

  const skills: SkillGroup[] = profile.skills.map((group) => ({
    ...group,
    items: prioritize(group.items, skillsLabel(group.category), atoms, matchedIds, group.items.length, sourceMap),
  }));

  const content: ResumeContent = {
    contact: profile.contact,
    summary: profile.summary,
    skills,
    experience,
    projects,
    education: profile.education,
  };

  return { content, sourceMap };
}

/**
 * Whether every bullet/skill in a stored ResumeContent is still verbatim
 * text from the profile. A generation built by the earlier LLM-rewriting
 * design (deleted -- see the file header) can contain fabricated sentences
 * that don't exist anywhere in the profile; this catches that so a stale,
 * fabricated generation is never displayed as if it were today's
 * selection-only output. Not a perfect entry-level check (a bullet stolen
 * from a different profile entry would still pass), but it catches the
 * failure mode that actually happened: invented text, not misattributed
 * text.
 * In plain terms: checks whether a saved resume's content is still 100%
 * copied from your profile, or whether it contains old AI-written text that
 * needs to be rebuilt.
 */
export function isResumeContentVerbatim(content: ResumeContent, profile: Profile): boolean {
  const validTexts = new Set<string>();
  for (const entry of profile.experience) for (const bullet of entry.bullets) validTexts.add(bullet);
  for (const entry of profile.projects) for (const bullet of entry.bullets) validTexts.add(bullet);
  for (const group of profile.skills) for (const item of group.items) validTexts.add(item);

  for (const entry of content.experience) for (const bullet of entry.bullets) if (!validTexts.has(bullet)) return false;
  for (const entry of content.projects) for (const bullet of entry.bullets) if (!validTexts.has(bullet)) return false;
  for (const group of content.skills) for (const item of group.items) if (!validTexts.has(item)) return false;

  return true;
}
