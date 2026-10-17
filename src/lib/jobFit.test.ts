// What this file is: unit tests for jobFit.ts -- line recommendations on
// both routes, and requirement coverage against a resume.
// In plain terms: tests proving the editor marks the right lines as fitting
// the job and counts covered requirements correctly.

import { describe, expect, it } from 'vitest';
import { buildJobFit, normalizeLine } from './jobFit';
import type { JobAnalysis, ProfileAtom, ResumeContent } from '../types';

const atoms: ProfileAtom[] = [
  { id: 'e1', source: 'experience', sourceLabel: 'Experience: Lead, Club', text: 'Ran the spring fair' },
  { id: 'e2', source: 'experience', sourceLabel: 'Experience: Lead, Club', text: 'Wrote the newsletter' },
  { id: 's1', source: 'skills', sourceLabel: 'Skills: Tools', text: 'Figma' },
  { id: 'x1', source: 'additional', sourceLabel: 'Additional information', text: 'Fluent in Spanish' },
];

const analysis: JobAnalysis = {
  roleSummary: '',
  keywords: [],
  requirements: [
    { id: 'r1', text: 'Event planning', severity: 'preferred', order: 0 },
    { id: 'r2', text: 'Design tools', severity: 'required', order: 1 },
    { id: 'r3', text: 'Spanish', severity: 'required', order: 2 },
    { id: 'r4', text: 'Accounting', severity: 'required', order: 3 },
  ],
  matches: [
    { requirementId: 'r1', status: 'full', atomIds: ['e1'] },
    { requirementId: 'r2', status: 'full', atomIds: ['s1'] },
    { requirementId: 'r3', status: 'full', atomIds: ['x1'] },
    { requirementId: 'r4', status: 'gap_no_candidates', atomIds: [] },
  ],
};

function resume(bullets: string[], skills: string[] = []): ResumeContent {
  return {
    contact: { name: '', email: '', links: [] },
    skills: [{ category: 'Tools', items: skills }],
    experience: [{ company: 'Club', title: 'Lead', current: false, bullets }],
    projects: [],
    education: [],
  };
}

describe('normalizeLine', () => {
  it('ignores case, spacing and a trailing full stop', () => {
    expect(normalizeLine('  Ran the  Spring fair. ')).toBe(normalizeLine('ran the spring fair'));
  });
});

describe('buildJobFit', () => {
  it('names the requirements a line answers, even after a small edit', () => {
    const fit = buildJobFit(atoms, resume([]), { analysis });
    expect(fit.reasonFor('ran the spring fair.')).toEqual({ requirements: ['Event planning'] });
    expect(fit.reasonFor('Wrote the newsletter')).toBeNull();
    expect(fit.reasonFor('Something new')).toBeNull();
  });

  it('marks the direct read picks as recommended without a requirement', () => {
    const fit = buildJobFit(atoms, resume([]), {
      holistic: { createdAt: 0, atomIds: ['e2'], roleSummary: '', groupNotes: [] },
    });
    expect(fit.reasonFor('Wrote the newsletter')).toEqual({ requirements: [] });
    expect(fit.reasonFor('Ran the spring fair')).toBeNull();
    expect(fit.coverage).toEqual([]);
  });

  it('lists required requirements first, in posting order, each with its coverage', () => {
    const fit = buildJobFit(atoms, resume(['Ran the spring fair']), { analysis });
    const byId = Object.fromEntries(fit.coverage.map((c) => [c.requirement.id, c]));

    expect(fit.coverage.map((c) => c.requirement.id)).toEqual(['r2', 'r3', 'r4', 'r1']);
    expect(byId.r1.status).toBe('onResume');
    expect(byId.r2.status).toBe('inProfile');
    expect(byId.r2.addable.map((a) => a.id)).toEqual(['s1']);
    // Additional information never prints, so it can't be added in one click.
    expect(byId.r3.status).toBe('inProfile');
    expect(byId.r3.addable).toEqual([]);
    expect(byId.r4.status).toBe('gap');
  });

  it('counts a skill on the resume as covering its requirement', () => {
    const fit = buildJobFit(atoms, resume([], ['Figma']), { analysis });
    expect(fit.coverage.find((c) => c.requirement.id === 'r2')?.status).toBe('onResume');
  });

  it('counts a printed degree as covering a degree requirement', () => {
    const degreeAtom: ProfileAtom = { id: 'd1', source: 'education', sourceLabel: 'Education: Uni', text: 'B.S. in Accounting' };
    const degreeAnalysis: JobAnalysis = {
      ...analysis,
      requirements: [{ id: 'r9', text: 'Associate degree', severity: 'preferred', order: 0, kind: 'education' }],
      matches: [{ requirementId: 'r9', status: 'full', atomIds: ['d1'] }],
    };
    const content = { ...resume([]), education: [{ school: 'Uni', degree: 'B.S.', field: 'Accounting' }] } as ResumeContent;
    const fit = buildJobFit([...atoms, degreeAtom], content, { analysis: degreeAnalysis });
    expect(fit.coverage.find((c) => c.requirement.id === 'r9')?.status).toBe('onResume');
  });
});
