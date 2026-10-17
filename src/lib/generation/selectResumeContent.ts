// What this file is: pure, deterministic selection/prioritization logic for
// Phase 4's resume generation -- no LLM call, no rewritten text. Every
// bullet and skill in the output is copied verbatim from the profile; all
// this does is reorder items within each section so ones already confirmed
// as evidence for a requirement (see matching, src/lib/matching/) surface
// first (best weighted coverage first), drop self-negative lines, and rank which projects
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
  HolisticSelection,
  JobAnalysis,
  Profile,
  ProfileAtom,
  ProjectEntry,
  ResumeContent,
  SkillGroup,
  SourceMapEntry,
} from '../../types';
import { experienceLabel, projectLabel, skillsLabel } from '../profileAtoms';
import { requirementWeight } from '../matching/fitScore';

// No per-entry bullet cap: every entry starts with all its bullets, best
// first, and fitToOnePage.ts trims from the bottom until the page fits. A cap
// here left half a page empty.
export const MAX_PROJECTS = 2;

// Phrases where the candidate's own text argues against themselves, e.g.
// "Windows (no Mac experiance)". Matched loosely (typos like "experiance").
const SELF_NEGATIVE_PATTERNS: RegExp[] = [
  /\bno\s+(?:[\w./+#-]+\s+){0,3}?(?:experi\w*|exposure|knowledge|familiarity)\b/i,
  /\bno\s+prior\b/i,
  /\bnot\s+(?:very\s+)?(?:familiar|experienced|proficient)\b/i,
  /\blimited\s+(?:\w+\s+)?(?:experi\w*|knowledge|exposure|familiarity|proficiency)\b/i,
  /\bnever\s+(?:used|worked|done|tried|touched)\b/i,
  /\(\s*(?:no|not|never|limited)\b[^)]*\)/i,
];

/**
 * Whether a line of the profile undercuts the candidate ("no Mac experience",
 * "not familiar with X", "limited ...", "never used ...", "(no ...)").
 * In plain terms: spots a line that says what you can NOT do, so it is never
 * printed on a resume.
 */
export function isSelfNegative(text: string): boolean {
  return SELF_NEGATIVE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * A skill item ready to print, or null when nothing worth printing is left.
 * A self-negative parenthetical is cut off the item ("Windows (no Mac
 * experiance)" -> "Windows"); an item that is itself self-negative is dropped.
 * In plain terms: removes the "(no ...)" part of a skill, or the skill if it
 * only says what you cannot do.
 */
export function cleanSkillItem(item: string): string | null {
  const cleaned = item
    .replace(/\s*\([^)]*\)/g, (parenthetical) => (isSelfNegative(parenthetical) ? '' : parenthetical))
    .trim();
  if (cleaned === '' || isSelfNegative(cleaned)) return null;
  return cleaned;
}

function sectionAtomsByText(atoms: ProfileAtom[], label: string): Map<string, ProfileAtom> {
  const map = new Map<string, ProfileAtom>();
  for (const atom of atoms) {
    if (atom.sourceLabel === label) map.set(atom.text, atom);
  }
  return map;
}

// One atom's rank score: its weighted coverage when known, else 1 when it is
// matched (the holistic route has no per-requirement weights), else 0.
function scoreOf(atomId: string | undefined, matchedIds: Set<string>, weights: Map<string, number>): number {
  if (!atomId) return 0;
  return weights.get(atomId) ?? (matchedIds.has(atomId) ? 1 : 0);
}

/**
 * Orders items best first: highest weighted coverage, then matched before
 * unmatched, then original order. Keeps every item (no cap; fitToOnePage.ts
 * trims to the page) and records a sourceMap entry for every matched item.
 * `clean` may rewrite or drop an item (self-negative lines); the atom is
 * looked up with the original text.
 * In plain terms: puts your strongest bullets/skills first and keeps them all.
 */
function prioritize(
  items: string[],
  label: string,
  atoms: ProfileAtom[],
  matchedIds: Set<string>,
  weights: Map<string, number>,
  sourceMap: SourceMapEntry[],
  clean: (item: string) => string | null,
): string[] {
  const index = sectionAtomsByText(atoms, label);
  // Blank items (an empty bullet left by Enter or "Add highlight") are never
  // printed.
  const entries = items.flatMap((item, i) => {
    if (item.trim() === '') return [];
    const text = clean(item);
    if (text === null) return [];
    const atom = index.get(item);
    return [
      {
        text,
        i,
        score: scoreOf(atom?.id, matchedIds, weights),
        matched: Boolean(atom && matchedIds.has(atom.id)),
        atomId: atom?.id,
      },
    ];
  });

  const ordered = entries.sort((a, b) => b.score - a.score || Number(b.matched) - Number(a.matched) || a.i - b.i);

  for (const entry of ordered) {
    if (entry.matched && entry.atomId) {
      sourceMap.push({ generatedText: entry.text, atomIds: [entry.atomId] });
    }
  }

  return ordered.map((entry) => entry.text);
}

function totalScore(
  items: string[],
  label: string,
  atoms: ProfileAtom[],
  matchedIds: Set<string>,
  weights: Map<string, number>,
): number {
  const index = sectionAtomsByText(atoms, label);
  return items.reduce((sum, item) => sum + scoreOf(index.get(item)?.id, matchedIds, weights), 0);
}

// Weighted coverage per atom: for every matched requirement, add the fitScore
// weight times the status value (full 1, partial 0.5, gap 0).
function coverageWeights(analysis: JobAnalysis): Map<string, number> {
  const requirementById = new Map(analysis.requirements.map((r) => [r.id, r]));
  const weights = new Map<string, number>();
  for (const match of analysis.matches) {
    const requirement = requirementById.get(match.requirementId);
    const base = requirement ? requirementWeight(requirement) : 1;
    const value = match.status === 'full' ? 1 : match.status === 'partial' ? 0.5 : 0;
    for (const atomId of match.atomIds) weights.set(atomId, (weights.get(atomId) ?? 0) + base * value);
  }
  return weights;
}

/**
 * Selects and orders resume content for one job posting -- purely from
 * already-real profile text and the matching pass's evidence links, no
 * generation involved. Contact/education are copied verbatim
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
  return selectResumeFromAtomIds(
    profile,
    new Set(analysis.matches.flatMap((m) => m.atomIds)),
    atoms,
    coverageWeights(analysis),
  );
}

/**
 * The selection itself, given whichever set of atom ids counts as
 * "prioritized" -- confirmed requirement matches on the matched route,
 * the model's own picks on the direct route (see runHolisticSelection.ts).
 * Both routes share this so a resume is built exactly one way, and the only
 * thing that differs between them is how the priority set was decided.
 * In plain terms: the one piece of code that actually builds the resume,
 * given a list of which of your bullets matter for this job.
 */
export function selectResumeFromAtomIds(
  profile: Profile,
  matchedIds: Set<string>,
  atoms: ProfileAtom[],
  weights: Map<string, number> = new Map(),
): { content: ResumeContent; sourceMap: SourceMapEntry[] } {
  const sourceMap: SourceMapEntry[] = [];
  // A self-negative bullet is never printed.
  const notNegative = (item: string) => (isSelfNegative(item) ? null : item);

  const experience: ExperienceEntry[] = profile.experience.map((entry) => ({
    ...entry,
    bullets: prioritize(entry.bullets, experienceLabel(entry), atoms, matchedIds, weights, sourceMap, notNegative),
  }));

  // A project with bullets, or with a description to show, can be printed.
  // One with neither would be dropped at render time, so it must not take
  // one of the MAX_PROJECTS slots.
  const rankedProjects = profile.projects
    .map((entry, index) => ({
      entry,
      index,
      score: totalScore(entry.bullets, projectLabel(entry), atoms, matchedIds, weights),
    }))
    .filter(({ entry }) => entry.description.trim() !== '' || entry.bullets.some((b) => b.trim() !== ''))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_PROJECTS)
    .sort((a, b) => a.index - b.index);

  const projects: ProjectEntry[] = rankedProjects.map(({ entry }) => ({
    ...entry,
    bullets: prioritize(entry.bullets, projectLabel(entry), atoms, matchedIds, weights, sourceMap, notNegative),
  }));

  const skills: SkillGroup[] = profile.skills.map((group) => ({
    ...group,
    items: prioritize(group.items, skillsLabel(group.category), atoms, matchedIds, weights, sourceMap, cleanSkillItem),
  }));

  const content: ResumeContent = {
    contact: profile.contact,
    ...(profile.summary?.trim() ? { summary: profile.summary } : {}),
    skills,
    experience,
    projects,
    education: profile.education,
  };

  return { content, sourceMap };
}

/**
 * The direct route's entry point: same selection, with the priority set taken
 * from one holistic LLM pass instead of per-requirement matching. Still
 * selection-only -- a HolisticSelection carries atom ids, never text, so
 * nothing here can say anything the profile doesn't already say, exactly as
 * on the matched route.
 * In plain terms: builds the resume from the bullets the AI picked when it
 * read the whole job ad at once.
 */
export function selectResumeContentHolistic(
  profile: Profile,
  selection: HolisticSelection,
  atoms: ProfileAtom[],
): { content: ResumeContent; sourceMap: SourceMapEntry[] } {
  return selectResumeFromAtomIds(profile, new Set(selection.atomIds), atoms);
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
  for (const group of profile.skills) {
    for (const item of group.items) {
      validTexts.add(item);
      const cleaned = cleanSkillItem(item);
      if (cleaned) validTexts.add(cleaned);
    }
  }

  for (const entry of content.experience) for (const bullet of entry.bullets) if (!validTexts.has(bullet)) return false;
  for (const entry of content.projects) for (const bullet of entry.bullets) if (!validTexts.has(bullet)) return false;
  for (const group of content.skills) for (const item of group.items) if (!validTexts.has(item)) return false;

  return true;
}
