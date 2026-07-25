// What this file is: computes a single 0-100 "fit score" for a job posting
// from its requirement match statuses, weighting required requirements more
// heavily than preferred ones. Pure function, no LLM/network call.
// In plain terms: turns all the individual requirement matches into one
// overall percentage so you can quickly gauge how good a fit a job is.

import type { JobAnalysis, MatchStatus } from '../../types';

const SEVERITY_WEIGHT = { required: 2, preferred: 1 } as const;

const STATUS_VALUE: Record<MatchStatus, number> = {
  full: 1,
  partial: 0.5,
  gap_no_candidates: 0,
  gap_unverified: 0,
};

/**
 * Returns a 0-100 fit score, or null if matching hasn't been run yet (no
 * point showing "0% fit" before any requirement has actually been checked).
 *
 * In plain terms: how well this job matches your profile, as one number.
 */
export function computeFitScore(analysis: JobAnalysis | undefined): number | null {
  if (!analysis || analysis.requirements.length === 0 || analysis.matches.length === 0) return null;

  const matchByRequirementId = new Map(analysis.matches.map((m) => [m.requirementId, m]));
  let earned = 0;
  let possible = 0;
  for (const requirement of analysis.requirements) {
    const weight = SEVERITY_WEIGHT[requirement.severity];
    const status = matchByRequirementId.get(requirement.id)?.status ?? 'gap_no_candidates';
    earned += weight * STATUS_VALUE[status];
    possible += weight;
  }

  return possible > 0 ? Math.round((earned / possible) * 100) : null;
}

/**
 * Maps a fit score to the badge color used to display it.
 *
 * In plain terms: picks the traffic-light color for a fit score.
 */
export function fitScoreColor(score: number | null): 'slate' | 'green' | 'amber' | 'red' {
  if (score === null) return 'slate';
  if (score >= 70) return 'green';
  if (score >= 40) return 'amber';
  return 'red';
}
