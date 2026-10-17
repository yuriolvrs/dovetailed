// What this file is: works out, for one posting, which profile lines are
// recommended (the requirements each one answers, or the direct read's
// picks) and how well a resume covers the posting's requirements. Pure and
// synchronous: it only reads the stored matches or selection, no LLM call.
// In plain terms: decides which of your lines the job is asking for, and
// which of the job's requirements your resume already answers.

import type { HolisticSelection, JobAnalysis, ProfileAtom, Requirement, ResumeContent } from '../types';
import { degreeLine } from './profileAtoms';

/** Why a line is recommended for this job. */
export interface FitReason {
  /** Requirement texts the line answers. Empty when the direct read picked it without naming one. */
  requirements: string[];
}

/** One requirement and how the resume stands on it. */
export interface RequirementCoverage {
  requirement: Requirement;
  /**
   * 'onResume': a line that answers it is on the resume.
   * 'inProfile': only lines not on the resume answer it.
   * 'gap': nothing in the profile answers it.
   */
  status: 'onResume' | 'inProfile' | 'gap';
  /** Matched lines that are on the resume now. */
  onResume: ProfileAtom[];
  /** Matched lines that could be added (bullets and skills not on the resume). */
  addable: ProfileAtom[];
}

export interface JobFit {
  /** Why `text` is recommended, or null when it is not. Small edits keep the match. */
  reasonFor: (text: string) => FitReason | null;
  /** Requirement coverage, required first. Empty on the direct route, which has no requirement list. */
  coverage: RequirementCoverage[];
}

/**
 * Collapses whitespace, case and trailing punctuation, so fixing a typo or
 * adding a full stop does not drop a line's recommendation.
 * In plain terms: compares two lines while ignoring tiny differences.
 */
export function normalizeLine(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');
}

/**
 * Every printed line of a resume (bullets, skills, degrees, education details),
 * normalized.
 * In plain terms: the set of lines that are on the resume right now.
 */
export function resumeLines(content: ResumeContent): Set<string> {
  const lines = new Set<string>();
  const add = (text: string) => text.trim() && lines.add(normalizeLine(text));
  for (const entry of content.experience) entry.bullets.forEach(add);
  for (const entry of content.projects) entry.bullets.forEach(add);
  for (const group of content.skills) group.items.forEach(add);
  for (const entry of content.education) {
    add(degreeLine(entry));
    (entry.details ?? []).forEach(add);
  }
  return lines;
}

/**
 * Builds the recommendation lookup and the requirement coverage for one
 * resume. Pass `analysis` on the matched route and `holistic` on the direct
 * route; with neither, nothing is recommended.
 * In plain terms: everything the editor needs to mark lines as "fits this
 * job" and to list which requirements are covered.
 */
export function buildJobFit(
  atoms: ProfileAtom[],
  content: ResumeContent,
  source: { analysis?: JobAnalysis; holistic?: HolisticSelection },
): JobFit {
  const idsByLine = new Map<string, string[]>();
  for (const atom of atoms) {
    const key = normalizeLine(atom.text);
    idsByLine.set(key, [...(idsByLine.get(key) ?? []), atom.id]);
  }

  // Atom id -> the requirement texts it was confirmed for.
  const requirementsById = new Map<string, string[]>();
  const analysis = source.analysis;
  if (analysis) {
    const textById = new Map(analysis.requirements.map((r) => [r.id, r.text]));
    for (const match of analysis.matches) {
      const text = textById.get(match.requirementId);
      if (!text) continue;
      for (const id of match.atomIds) requirementsById.set(id, [...(requirementsById.get(id) ?? []), text]);
    }
  }
  const picked = new Set(source.holistic?.atomIds ?? []);

  function reasonFor(text: string): FitReason | null {
    const ids = idsByLine.get(normalizeLine(text));
    if (!ids) return null;
    const requirements = [...new Set(ids.flatMap((id) => requirementsById.get(id) ?? []))];
    if (requirements.length > 0) return { requirements };
    return ids.some((id) => picked.has(id)) ? { requirements: [] } : null;
  }

  const coverage: RequirementCoverage[] = [];
  if (analysis) {
    const atomsById = new Map(atoms.map((a) => [a.id, a]));
    const onPage = resumeLines(content);
    const ordered = [...analysis.requirements].sort(
      (a, b) => Number(a.severity !== 'required') - Number(b.severity !== 'required') || a.order - b.order,
    );
    for (const requirement of ordered) {
      const match = analysis.matches.find((m) => m.requirementId === requirement.id);
      const matched = (match?.atomIds ?? []).map((id) => atomsById.get(id)).filter((a): a is ProfileAtom => Boolean(a));
      const onResume = matched.filter((a) => onPage.has(normalizeLine(a.text)));
      // Only bullets and skills can be put on a resume with one click.
      const addable = matched.filter(
        (a) => !onPage.has(normalizeLine(a.text)) && (a.source === 'experience' || a.source === 'projects' || a.source === 'skills'),
      );
      const status = onResume.length > 0 ? 'onResume' : matched.length > 0 ? 'inProfile' : 'gap';
      coverage.push({ requirement, status, onResume, addable });
    }
  }

  return { reasonFor, coverage };
}
