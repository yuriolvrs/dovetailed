// What this file is: pure helpers that pick the profile lines a posting's
// highest-weight requirements lean on. One list feeds the opt-in summary
// suggestion (the evidence the model may draw from). The other names the few
// resume bullets that get a quiet "Suggested wording for this job" prompt.
// No LLM call and no stored data is touched here.
// In plain terms: finds the strongest lines on your profile and resume for
// the things this job cares about most.

import type { JobAnalysis, MatchStatus, ProfileAtom, ResumeContent } from '../types';
import { requirementWeight } from './matching/fitScore';
import { normalizeLine } from './jobFit';
import { isSelfNegative } from './generation/selectResumeContent';

export const MAX_SUMMARY_LINES = 6;
export const MAX_SUGGESTED_BULLETS = 3;

const STATUS_VALUE: Partial<Record<MatchStatus, number>> = { full: 1, partial: 0.5 };

/**
 * Profile lines matched to the posting's top requirements, strongest first,
 * each text once. Self-negative lines ("no Mac experience") are left out.
 * In plain terms: the real lines that best answer what the job asks for.
 */
export function topRequirementLines(
  analysis: JobAnalysis,
  atoms: ProfileAtom[],
  limit: number = MAX_SUMMARY_LINES,
): string[] {
  const atomsById = new Map(atoms.map((a) => [a.id, a]));
  const matchByRequirement = new Map(analysis.matches.map((m) => [m.requirementId, m]));
  const ranked = analysis.requirements
    .map((requirement) => {
      const match = matchByRequirement.get(requirement.id);
      return { requirement, match, score: requirementWeight(requirement) * (STATUS_VALUE[match?.status ?? 'gap_unverified'] ?? 0) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.requirement.order - b.requirement.order);

  const lines: string[] = [];
  for (const { match } of ranked) {
    for (const id of match?.atomIds ?? []) {
      const text = atomsById.get(id)?.text.trim();
      if (text && !isSelfNegative(text) && !lines.includes(text)) lines.push(text);
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}

/**
 * The normalized text of the resume bullets (jobs and projects) that answer
 * the highest-weight requirements, best first, at most `limit`. A bullet's
 * score is the sum of weight x match strength over the requirements it backs.
 * In plain terms: which two or three bullets on the resume matter most for
 * this job.
 */
export function topResumeBullets(
  analysis: JobAnalysis,
  atoms: ProfileAtom[],
  content: ResumeContent,
  limit: number = MAX_SUGGESTED_BULLETS,
): Set<string> {
  const onResume = new Set<string>();
  for (const entry of [...content.experience, ...content.projects]) {
    for (const bullet of entry.bullets) if (bullet.trim()) onResume.add(normalizeLine(bullet));
  }

  const atomsById = new Map(atoms.map((a) => [a.id, a]));
  const requirementsById = new Map(analysis.requirements.map((r) => [r.id, r]));
  const scores = new Map<string, number>();
  for (const match of analysis.matches) {
    const requirement = requirementsById.get(match.requirementId);
    const value = STATUS_VALUE[match.status] ?? 0;
    if (!requirement || value === 0) continue;
    for (const id of match.atomIds) {
      const atom = atomsById.get(id);
      if (!atom || (atom.source !== 'experience' && atom.source !== 'projects')) continue;
      const key = normalizeLine(atom.text);
      if (onResume.has(key)) scores.set(key, (scores.get(key) ?? 0) + requirementWeight(requirement) * value);
    }
  }

  return new Set(
    [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => key),
  );
}
