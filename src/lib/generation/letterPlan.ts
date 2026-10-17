// What this file is: builds the cover letter plan in code, before the model call. It picks the two
// or three most important requirements the candidate covers, each with its single best evidence
// line, plus at most one key gap to admit, plus the Summary line when the profile has one.
// In plain terms: decides what the letter should talk about, so the AI does not have to guess.

import type { JobAnalysis, MatchStatus, ProfileAtom, Requirement } from '../../types';
import type { CoverLetterPlan, PlannedEvidence } from '../../prompts/generateCoverLetter';
import { SUMMARY_LABEL } from '../profileAtoms';
import { requirementWeight } from '../matching/fitScore';

const BASE_REQUIREMENTS = 2;
const MAX_REQUIREMENTS = 3;

const SOURCE_RANK: Record<ProfileAtom['source'], number> = {
  experience: 0,
  projects: 0,
  additional: 1,
  skills: 2,
  education: 3,
};

/** The Summary atom, when the profile has one. */
export function findSummaryAtom(atoms: ProfileAtom[]): ProfileAtom | undefined {
  return atoms.find((a) => a.sourceLabel === SUMMARY_LABEL);
}

/** Lower is better: a job or project bullet beats a skill tag; the Summary is never body evidence. */
function atomRank(atom: ProfileAtom): number {
  return atom.sourceLabel === SUMMARY_LABEL ? 4 : SOURCE_RANK[atom.source];
}

/** The best atom among `ids` (first in list wins a tie), skipping `avoid` unless nothing else is left. */
function bestAtom(ids: string[], byId: Map<string, ProfileAtom>, avoid: Set<string>): ProfileAtom | undefined {
  const found = ids.map((id) => byId.get(id)).filter((a): a is ProfileAtom => a !== undefined);
  const pool = found.some((a) => !avoid.has(a.id)) ? found.filter((a) => !avoid.has(a.id)) : found;
  return pool.reduce<ProfileAtom | undefined>((best, a) => (best && atomRank(best) <= atomRank(a) ? best : a), undefined);
}

function evidenceOf(atom: ProfileAtom): PlannedEvidence {
  return { atomId: atom.id, sourceLabel: atom.sourceLabel, text: atom.text };
}

/**
 * Builds the plan. Covered requirements (full or partial, not degree requirements) are ordered
 * required before preferred, full before partial, then by requirement weight, then posting order.
 * The top 2 are planned, plus a third when it is required and fully covered. The key gap is the
 * heaviest required, non-degree requirement with a gap status; it needs a closest real evidence
 * line (a considered atom, else the first planned requirement's evidence), or there is no gap.
 * With no analysis (the direct route) the plan has no requirements and no gap.
 * In plain terms: picks which strengths to feature, which job each comes from, and which gap to own up to.
 */
export function planCoverLetter(analysis: JobAnalysis | undefined, atoms: ProfileAtom[]): CoverLetterPlan {
  const summary = findSummaryAtom(atoms);
  const plan: CoverLetterPlan = { requirements: [], ...(summary ? { summaryAtomId: summary.id } : {}) };
  if (!analysis) return plan;

  const byId = new Map(atoms.map((a) => [a.id, a]));
  const matchByReq = new Map(analysis.matches.map((m) => [m.requirementId, m]));
  const severityRank = (r: Requirement) => (r.severity === 'required' ? 0 : 1);
  const statusRank = (s: MatchStatus) => (s === 'full' ? 0 : 1);

  const covered = analysis.requirements
    .filter((r) => r.kind !== 'education')
    .map((r) => ({ r, m: matchByReq.get(r.id) }))
    .filter(({ m }) => m !== undefined && (m.status === 'full' || m.status === 'partial'))
    .sort(
      (a, b) =>
        severityRank(a.r) - severityRank(b.r) ||
        statusRank(a.m!.status) - statusRank(b.m!.status) ||
        requirementWeight(b.r) - requirementWeight(a.r) ||
        a.r.order - b.r.order,
    );

  const used = new Set<string>();
  for (const { r, m } of covered) {
    const limit =
      plan.requirements.length < BASE_REQUIREMENTS
        ? BASE_REQUIREMENTS
        : r.severity === 'required' && m!.status === 'full'
          ? MAX_REQUIREMENTS
          : BASE_REQUIREMENTS;
    if (plan.requirements.length >= limit) break;
    const atom = bestAtom(m!.atomIds, byId, used);
    if (!atom) continue;
    used.add(atom.id);
    plan.requirements.push({ id: r.id, text: r.text, evidence: evidenceOf(atom) });
  }

  const gap = analysis.requirements
    .filter((r) => r.severity === 'required' && r.kind !== 'education')
    .filter((r) => {
      const status = matchByReq.get(r.id)?.status;
      return status === 'gap_no_candidates' || status === 'gap_unverified';
    })
    .sort((a, b) => requirementWeight(b) - requirementWeight(a) || a.order - b.order)[0];
  if (gap) {
    const considered = bestAtom(matchByReq.get(gap.id)?.consideredAtomIds ?? [], byId, new Set());
    const closest = considered ? evidenceOf(considered) : plan.requirements[0]?.evidence;
    if (closest) plan.gap = { id: gap.id, text: gap.text, evidence: closest };
  }

  return plan;
}
