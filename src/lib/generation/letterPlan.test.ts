// What this file is: unit tests for the cover letter plan (which requirements, evidence and gap the
// letter features).
// In plain terms: tests proving the code picks the right strengths and the right gap for the letter.

import { describe, expect, it } from 'vitest';
import { planCoverLetter } from './letterPlan';
import type { JobAnalysis, ProfileAtom, Requirement, RequirementMatch } from '../../types';

function atom(id: string, source: ProfileAtom['source'], sourceLabel: string, text = id): ProfileAtom {
  return { id, source, sourceLabel, text };
}

function req(id: string, o: Partial<Requirement> = {}): Requirement {
  return { id, text: `req ${id}`, severity: 'required', order: Number(id.replace(/\D/g, '')) || 0, ...o };
}

function analysis(requirements: Requirement[], matches: RequirementMatch[]): JobAnalysis {
  return { roleSummary: 'x', requirements, keywords: [], matches };
}

const hospital = 'Experience: Scribe, Hospital';
const atoms = [
  atom('s1', 'skills', 'Skills: Tools'),
  atom('e1', 'experience', hospital),
  atom('e2', 'experience', 'Experience: Volunteer, Clinic'),
  atom('e3', 'experience', hospital),
  atom('sum', 'additional', 'Summary', 'Moving from nursing to health IT'),
];

describe('planCoverLetter', () => {
  it('orders required before preferred, full before partial, then by weight', () => {
    const a = analysis(
      [
        req('r1', { severity: 'preferred' }),
        req('r2', { severity: 'required', kind: 'duty' }),
        req('r3', { severity: 'required' }),
        req('r4', { severity: 'required' }),
      ],
      [
        { requirementId: 'r1', status: 'full', atomIds: ['e1'] },
        { requirementId: 'r2', status: 'full', atomIds: ['e2'] },
        { requirementId: 'r3', status: 'partial', atomIds: ['e3'] },
        { requirementId: 'r4', status: 'full', atomIds: ['e1'] },
      ],
    );
    const plan = planCoverLetter(a, atoms);
    // r4 (required, full, weight 2) beats r2 (required, full, duty weight 1); r3 is partial.
    expect(plan.requirements.map((r) => r.id)).toEqual(['r4', 'r2']);
  });

  it('adds a third requirement only when it is required and full', () => {
    const matches: RequirementMatch[] = ['r1', 'r2', 'r3'].map((id) => ({
      requirementId: id,
      status: 'full',
      atomIds: ['e1', 'e2', 's1'],
    }));
    const three = planCoverLetter(analysis([req('r1'), req('r2'), req('r3')], matches), atoms);
    expect(three.requirements).toHaveLength(3);
    const preferredThird = planCoverLetter(
      analysis([req('r1'), req('r2'), req('r3', { severity: 'preferred' })], matches),
      atoms,
    );
    expect(preferredThird.requirements).toHaveLength(2);
  });

  it('picks a job bullet over a skill tag and carries its sourceLabel', () => {
    const a = analysis([req('r1')], [{ requirementId: 'r1', status: 'full', atomIds: ['s1', 'e2'] }]);
    const plan = planCoverLetter(a, atoms);
    expect(plan.requirements[0].evidence).toMatchObject({ atomId: 'e2', sourceLabel: 'Experience: Volunteer, Clinic' });
  });

  it('avoids reusing the same atom for two requirements when another is available', () => {
    const a = analysis(
      [req('r1'), req('r2')],
      [
        { requirementId: 'r1', status: 'full', atomIds: ['e1'] },
        { requirementId: 'r2', status: 'full', atomIds: ['e1', 'e2'] },
      ],
    );
    expect(planCoverLetter(a, atoms).requirements.map((r) => r.evidence.atomId)).toEqual(['e1', 'e2']);
  });

  it('skips degree requirements and requirements whose atoms are unknown', () => {
    const a = analysis(
      [req('r1', { kind: 'education' }), req('r2')],
      [
        { requirementId: 'r1', status: 'full', atomIds: ['e1'] },
        { requirementId: 'r2', status: 'full', atomIds: ['missing'] },
      ],
    );
    expect(planCoverLetter(a, atoms).requirements).toEqual([]);
  });

  it('picks the heaviest required gap, skipping degrees, with a considered atom as closest evidence', () => {
    const a = analysis(
      [req('r1', { kind: 'education' }), req('r2', { kind: 'duty' }), req('r3'), req('r4', { severity: 'preferred' })],
      [
        { requirementId: 'r1', status: 'gap_no_candidates', atomIds: [] },
        { requirementId: 'r2', status: 'gap_no_candidates', atomIds: [] },
        { requirementId: 'r3', status: 'gap_unverified', atomIds: [], consideredAtomIds: ['s1', 'e2'] },
        { requirementId: 'r4', status: 'gap_no_candidates', atomIds: [] },
      ],
    );
    const plan = planCoverLetter(a, atoms);
    expect(plan.gap).toMatchObject({ id: 'r3', evidence: { atomId: 'e2' } });
  });

  it('falls back to the first planned requirement evidence for the gap, or plans no gap without any', () => {
    const covered: RequirementMatch = { requirementId: 'r1', status: 'full', atomIds: ['e1'] };
    const gap: RequirementMatch = { requirementId: 'r2', status: 'gap_no_candidates', atomIds: [] };
    expect(planCoverLetter(analysis([req('r1'), req('r2')], [covered, gap]), atoms).gap?.evidence.atomId).toBe('e1');
    expect(planCoverLetter(analysis([req('r2')], [gap]), atoms).gap).toBeUndefined();
  });

  it('records the Summary atom id when the profile has one', () => {
    expect(planCoverLetter(analysis([], []), atoms).summaryAtomId).toBe('sum');
    expect(planCoverLetter(analysis([], []), atoms.slice(0, 2)).summaryAtomId).toBeUndefined();
  });

  it('holistic fallback: no analysis gives no requirements and no gap', () => {
    const plan = planCoverLetter(undefined, atoms);
    expect(plan.requirements).toEqual([]);
    expect(plan.gap).toBeUndefined();
    expect(plan.summaryAtomId).toBe('sum');
  });
});
