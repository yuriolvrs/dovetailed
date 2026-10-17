// What this file is: unit tests for topEvidence.ts -- which profile lines and
// resume bullets the highest-weight requirements lean on.
// In plain terms: proves the strongest lines for a job are the ones picked.

import { describe, expect, it } from 'vitest';
import type { JobAnalysis, ProfileAtom, ResumeContent } from '../types';
import { topRequirementLines, topResumeBullets } from './topEvidence';

const atom = (id: string, text: string, source: ProfileAtom['source'] = 'experience'): ProfileAtom => ({
  id,
  source,
  sourceLabel: 'x',
  text,
});

const atoms = [
  atom('a', 'Led a team of five'),
  atom('b', 'Wrote weekly reports'),
  atom('c', 'Ran the front desk'),
  atom('d', 'Built a dashboard'),
  atom('e', 'Python', 'skills'),
  atom('f', 'No Mac experience'),
];

const analysis: JobAnalysis = {
  roleSummary: 'Team lead',
  keywords: ['leadership'],
  requirements: [
    { id: 'r1', text: 'Lead people', severity: 'required', order: 0 },
    { id: 'r2', text: 'Report writing', severity: 'preferred', order: 1 },
    { id: 'r3', text: 'Front desk', severity: 'required', order: 2 },
    { id: 'r4', text: 'Unmatched', severity: 'required', order: 3 },
  ],
  matches: [
    { requirementId: 'r1', status: 'full', atomIds: ['a', 'f'] },
    { requirementId: 'r2', status: 'full', atomIds: ['b'] },
    { requirementId: 'r3', status: 'partial', atomIds: ['c', 'e'] },
    { requirementId: 'r4', status: 'gap_unverified', atomIds: [], consideredAtomIds: ['d'] },
  ],
};

const content: ResumeContent = {
  contact: { name: 'A', email: 'a@b.c', links: [] },
  skills: [],
  experience: [{ company: 'Co', title: 'T', current: false, bullets: ['Led a team of five.', 'Wrote weekly reports', 'Ran the front desk'] }],
  projects: [{ name: 'P', description: '', bullets: ['Built a dashboard'], links: [] }],
  education: [],
};

describe('topRequirementLines', () => {
  it('lists matched lines for the heaviest requirements first, skipping gaps and self-negative lines', () => {
    const lines = topRequirementLines(analysis, atoms);
    expect(lines[0]).toBe('Led a team of five');
    expect(lines).toContain('Ran the front desk');
    expect(lines).not.toContain('Built a dashboard');
    expect(lines).not.toContain('No Mac experience');
  });

  it('respects the limit', () => {
    expect(topRequirementLines(analysis, atoms, 2)).toHaveLength(2);
  });
});

describe('topResumeBullets', () => {
  it('picks the bullets on the resume behind the heaviest requirements, at most the limit', () => {
    const top = topResumeBullets(analysis, atoms, content, 2);
    expect(top.size).toBe(2);
    expect(top.has('led a team of five')).toBe(true);
  });

  it('ignores unmatched bullets and skills', () => {
    const top = topResumeBullets(analysis, atoms, content);
    expect(top.has('built a dashboard')).toBe(false);
    expect(top.has('python')).toBe(false);
  });

  it('ignores a matched line that is not on the resume', () => {
    const noReports = { ...content, experience: [{ ...content.experience[0], bullets: ['Led a team of five'] }] };
    expect([...topResumeBullets(analysis, atoms, noReports)]).toEqual(['led a team of five']);
  });
});
