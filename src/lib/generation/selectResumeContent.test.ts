// What this file is: unit tests for the deterministic resume-selection
// logic -- confirms every bullet/skill in the output is copied verbatim
// (never rewritten), matched items are prioritized/reordered but nothing is
// ever dropped from a bullet's text, experience entries are always kept,
// and projects are ranked/capped by matched-evidence count.
// In plain terms: tests proving the "build a tailored resume" step only
// ever selects and reorders your real content, never invents anything.

import { describe, expect, it } from 'vitest';
import {
  isResumeContentVerbatim,
  isSelfNegative,
  MAX_PROJECTS,
  selectResumeContent,
  selectResumeContentHolistic,
} from './selectResumeContent';
import type { HolisticSelection, JobAnalysis, Profile, ProfileAtom, ResumeContent } from '../../types';
import { emptyProfile } from '../profileStore';
import { buildProfileAtoms } from '../profileAtoms';

function profile(overrides: Partial<Profile> = {}): Profile {
  return { ...emptyProfile(), ...overrides };
}

function analysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return { roleSummary: '', requirements: [], keywords: [], matches: [], ...overrides };
}

function selection(atomIds: string[]): HolisticSelection {
  return { createdAt: 1, atomIds, roleSummary: '', overallRationale: '', groupNotes: [] };
}

describe('selectResumeContent', () => {
  it('copies contact/education verbatim', () => {
    const p = profile({
      contact: { name: 'Jane Doe', email: 'jane@x.com', links: [] },
      education: [{ school: 'MIT', degree: 'B.S.', current: false }],
    });
    const { content } = selectResumeContent(p, analysis(), []);
    expect(content.contact).toEqual(p.contact);
    expect(content.education).toEqual(p.education);
  });

  it('never changes a bullet\'s text, only its order', () => {
    const p = profile({
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          current: true,
          bullets: ['Wrote docs', 'Fixed a critical bug', 'Attended standups'],
        },
      ],
    });
    const atoms = buildProfileAtoms(p);
    const bugAtom = atoms.find((a) => a.text === 'Fixed a critical bug')!;
    const a = analysis({ matches: [{ requirementId: 'r1', status: 'full', atomIds: [bugAtom.id] }] });

    const { content } = selectResumeContent(p, a, atoms);

    expect([...content.experience[0].bullets].sort()).toEqual(
      ['Wrote docs', 'Fixed a critical bug', 'Attended standups'].sort(),
    );
    expect(content.experience[0].bullets[0]).toBe('Fixed a critical bug'); // matched bullet first
    expect(content.experience[0].company).toBe('Acme'); // structural fields untouched
  });

  it('keeps every experience entry even with zero matched evidence', () => {
    const p = profile({
      experience: [
        { company: 'Acme', title: 'Engineer', current: true, bullets: ['Did a thing'] },
        { company: 'Other Co', title: 'Intern', current: false, bullets: ['Did another thing'] },
      ],
    });
    const atoms = buildProfileAtoms(p);
    const { content } = selectResumeContent(p, analysis(), atoms);
    expect(content.experience).toHaveLength(2);
  });

  it('keeps every bullet of an entry (no cap) so the page can be filled', () => {
    const bullets = Array.from({ length: 7 }, (_, i) => `Bullet ${i}`);
    const p = profile({ experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets }] });
    const { content } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    expect(content.experience[0].bullets).toEqual(bullets);
  });

  it('leaves out blank bullets instead of printing them', () => {
    const bullets = ['', 'Shipped the billing service', '  ', 'Bullet 0'];
    const p = profile({ experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets }] });
    const { content } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    expect(content.experience[0].bullets).toEqual(['Shipped the billing service', 'Bullet 0']);
  });

  it('keeps every project bullet too', () => {
    const bullets = Array.from({ length: 6 }, (_, i) => `Bullet ${i}`);
    const p = profile({ projects: [{ name: 'Alpha', description: '', bullets, links: [] }] });
    const { content } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    expect(content.projects[0].bullets).toEqual(bullets);
  });

  it('puts matched bullets first and keeps the unmatched ones after them', () => {
    const bullets = ['B1', 'Matched bullet', 'B2', 'B3'];
    const p = profile({ experience: [{ company: 'Acme', title: 'Account Officer', current: true, bullets }] });
    const atoms = buildProfileAtoms(p);
    const matchedAtom = atoms.find((a) => a.text === 'Matched bullet')!;
    const a = analysis({ matches: [{ requirementId: 'r1', status: 'full', atomIds: [matchedAtom.id] }] });

    const { content } = selectResumeContent(p, a, atoms);

    expect(content.experience[0].bullets).toEqual(['Matched bullet', 'B1', 'B2', 'B3']);
  });

  it('orders bullets by weighted coverage: required full beats the rest, ties keep original order', () => {
    const bullets = ['Partial required', 'Full preferred', 'Full required', 'Unmatched'];
    const p = profile({ experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets }] });
    const atoms = buildProfileAtoms(p);
    const id = (text: string) => atoms.find((a) => a.text === text)!.id;
    const a = analysis({
      requirements: [
        { id: 'r1', text: 'one', severity: 'required', order: 0 },
        { id: 'r2', text: 'two', severity: 'preferred', order: 0 },
        { id: 'r3', text: 'three', severity: 'required', order: 0 },
      ],
      matches: [
        { requirementId: 'r1', status: 'partial', atomIds: [id('Partial required')] }, // 2 * 0.5 = 1
        { requirementId: 'r2', status: 'full', atomIds: [id('Full preferred')] }, // 1 * 1 = 1
        { requirementId: 'r3', status: 'full', atomIds: [id('Full required')] }, // 2
      ],
    });

    const { content } = selectResumeContent(p, a, atoms);

    expect(content.experience[0].bullets).toEqual(['Full required', 'Partial required', 'Full preferred', 'Unmatched']);
  });

  it('sums coverage when a bullet backs several requirements', () => {
    const bullets = ['Single', 'Double'];
    const p = profile({ experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets }] });
    const atoms = buildProfileAtoms(p);
    const id = (text: string) => atoms.find((a) => a.text === text)!.id;
    const a = analysis({
      requirements: [
        { id: 'r1', text: 'one', severity: 'preferred', order: 0 },
        { id: 'r2', text: 'two', severity: 'preferred', order: 0 },
      ],
      matches: [
        { requirementId: 'r1', status: 'full', atomIds: [id('Single'), id('Double')] },
        { requirementId: 'r2', status: 'full', atomIds: [id('Double')] },
      ],
    });
    expect(selectResumeContent(p, a, atoms).content.experience[0].bullets).toEqual(['Double', 'Single']);
  });

  it('never prints a self-negative bullet', () => {
    const bullets = ['Built reports', 'No Mac experience at all', 'Never used Salesforce'];
    const p = profile({ experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets }] });
    const { content } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    expect(content.experience[0].bullets).toEqual(['Built reports']);
  });

  it('drops only the negative parenthetical from a skill', () => {
    const p = profile({ skills: [{ category: 'Skills', items: ['QuickBooks', 'Windows (no Mac experiance)'] }] });
    const { content } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    expect(content.skills[0].items).toEqual(['QuickBooks', 'Windows']);
    expect(isResumeContentVerbatim(content, p)).toBe(true);
  });

  it('copies the profile summary verbatim, and omits it when blank', () => {
    const withSummary = profile({ summary: 'Staff accountant moving into project coordination.' });
    expect(selectResumeContent(withSummary, analysis(), []).content.summary).toBe(
      'Staff accountant moving into project coordination.',
    );
    expect('summary' in selectResumeContent(profile({ summary: '  ' }), analysis(), []).content).toBe(false);
  });

  it('keeps a project that has a description but no bullets, and skips a fully empty one', () => {
    const p = profile({
      projects: [
        { name: 'Thesis rebrand', description: 'Logo, social templates, flyer set', bullets: [], links: [] },
        { name: 'Empty', description: '', bullets: [], links: [] },
      ],
    });
    const { content } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    expect(content.projects.map((x) => x.name)).toEqual(['Thesis rebrand']);
  });

  it('Persona C: drops "no Mac" and keeps the billing line', () => {
    const p = profile({
      experience: [
        {
          company: 'Lakeshore Print & Packaging',
          title: 'Staff Accountant',
          current: true,
          bullets: ['Month end close, reconciliations, journal entries', 'Worked with production and sales on billing issues'],
        },
      ],
      skills: [{ category: 'Skills', items: ['Excel', 'QuickBooks', 'Windows (no Mac experiance)'] }],
    });
    const { content } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    expect(JSON.stringify(content)).not.toMatch(/no Mac/i);
    expect(content.experience[0].bullets).toContain('Worked with production and sales on billing issues');
  });

  it('isSelfNegative recognises the usual phrases and leaves normal lines alone', () => {
    for (const t of ['no Mac experiance', 'Not familiar with SQL', 'Limited experience with Java', 'Never used Figma', '(no Linux)']) {
      expect(isSelfNegative(t), t).toBe(true);
    }
    for (const t of ['Reduced no-show rates', 'Managed limited-edition releases', 'Excel (advanced: pivot tables)', 'Windows']) {
      expect(isSelfNegative(t), t).toBe(false);
    }
  });

  it(`caps included projects at MAX_PROJECTS (${MAX_PROJECTS}), preferring the ones with more matched bullets`, () => {
    const p = profile({
      projects: [
        { name: 'Alpha', description: '', bullets: ['Alpha bullet'], links: [] },
        { name: 'Beta', description: '', bullets: ['Beta bullet'], links: [] },
        { name: 'Gamma', description: '', bullets: ['Gamma bullet'], links: [] },
      ],
    });
    const atoms = buildProfileAtoms(p);
    const betaAtom = atoms.find((a) => a.text === 'Beta bullet')!;
    const gammaAtom = atoms.find((a) => a.text === 'Gamma bullet')!;
    const a = analysis({
      matches: [
        { requirementId: 'r1', status: 'full', atomIds: [betaAtom.id] },
        { requirementId: 'r2', status: 'full', atomIds: [gammaAtom.id] },
      ],
    });

    const { content } = selectResumeContent(p, a, atoms);

    expect(content.projects.map((proj) => proj.name)).toEqual(['Beta', 'Gamma']); // restored to original order
    expect(content.projects.find((proj) => proj.name === 'Alpha')).toBeUndefined();
  });

  it('reorders skill items within a category so matched ones come first, without dropping any', () => {
    const p = profile({ skills: [{ category: 'Languages', items: ['Python', 'Java', 'Go'] }] });
    const atoms = buildProfileAtoms(p);
    const javaAtom = atoms.find((a) => a.text === 'Java')!;
    const a = analysis({ matches: [{ requirementId: 'r1', status: 'full', atomIds: [javaAtom.id] }] });

    const { content } = selectResumeContent(p, a, atoms);

    expect(content.skills[0].category).toBe('Languages');
    expect(content.skills[0].items).toEqual(['Java', 'Python', 'Go']);
  });

  it('records a sourceMap entry only for matched, included items', () => {
    const p = profile({
      experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: ['Matched one', 'Unmatched one'] }],
    });
    const atoms = buildProfileAtoms(p);
    const matchedAtom = atoms.find((a) => a.text === 'Matched one')!;
    const a = analysis({ matches: [{ requirementId: 'r1', status: 'full', atomIds: [matchedAtom.id] }] });

    const { sourceMap } = selectResumeContent(p, a, atoms);

    expect(sourceMap).toEqual([{ generatedText: 'Matched one', atomIds: [matchedAtom.id] }]);
  });

  it('does not let evidence from one experience entry mark an identically-worded bullet matched in another', () => {
    const p = profile({
      experience: [
        { company: 'Acme', title: 'Engineer', current: true, bullets: ['Shared text'] },
        { company: 'Other Co', title: 'Intern', current: false, bullets: ['Shared text'] },
      ],
    });
    const atoms: ProfileAtom[] = buildProfileAtoms(p);
    const acmeAtom = atoms.find((a) => a.sourceLabel.includes('Acme'))!;
    const a = analysis({ matches: [{ requirementId: 'r1', status: 'full', atomIds: [acmeAtom.id] }] });

    const { sourceMap } = selectResumeContent(p, a, atoms);

    // Only Acme's copy should be recorded as matched, not Other Co's identical text.
    expect(sourceMap).toEqual([{ generatedText: 'Shared text', atomIds: [acmeAtom.id] }]);
  });
});

describe('isResumeContentVerbatim', () => {
  const p = profile({
    experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: ['Real bullet'] }],
    projects: [{ name: 'Alpha', description: '', bullets: ['Real project bullet'], links: [] }],
    skills: [{ category: 'Languages', items: ['Java'] }],
  });

  function content(overrides: Partial<ResumeContent> = {}): ResumeContent {
    const { content: base } = selectResumeContent(p, analysis(), buildProfileAtoms(p));
    return { ...base, ...overrides };
  }

  it('accepts a resume produced by selectResumeContent itself', () => {
    expect(isResumeContentVerbatim(content(), p)).toBe(true);
  });

  it('rejects a resume with a fabricated experience bullet not present anywhere in the profile', () => {
    const bad = content({
      experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: ['Invented sentence'] }],
    });
    expect(isResumeContentVerbatim(bad, p)).toBe(false);
  });

  it('rejects a fabricated project bullet', () => {
    const bad = content({
      projects: [{ name: 'Alpha', description: '', bullets: ['Invented project claim'], links: [] }],
    });
    expect(isResumeContentVerbatim(bad, p)).toBe(false);
  });

  it('rejects a fabricated skill', () => {
    const bad = content({ skills: [{ category: 'Languages', items: ['MadeUpTechnology'] }] });
    expect(isResumeContentVerbatim(bad, p)).toBe(false);
  });
});

describe('selectResumeContentHolistic', () => {
  it('prioritizes the atoms the model picked, exactly as matching does', () => {
    const p = profile({
      experience: [
        {
          company: 'Acme',
          title: 'Engineer',
          current: true,
          bullets: ['Wrote docs', 'Fixed a critical bug', 'Attended standups'],
        },
      ],
    });
    const atoms = buildProfileAtoms(p);
    const bugAtom = atoms.find((a) => a.text === 'Fixed a critical bug')!;

    const { content, sourceMap } = selectResumeContentHolistic(p, selection([bugAtom.id]), atoms);

    expect(content.experience[0].bullets[0]).toBe('Fixed a critical bug');
    expect(sourceMap).toContainEqual({ generatedText: 'Fixed a critical bug', atomIds: [bugAtom.id] });
  });

  it('produces byte-identical output to the matched route given the same atom ids', () => {
    const p = profile({
      experience: [
        { company: 'Acme', title: 'Engineer', current: true, bullets: ['A', 'B', 'C', 'D'] },
      ],
      skills: [{ category: 'Languages', items: ['Java', 'Python'] }],
    });
    const atoms = buildProfileAtoms(p);
    const picked = [atoms.find((a) => a.text === 'C')!.id, atoms.find((a) => a.text === 'Java')!.id];

    const holistic = selectResumeContentHolistic(p, selection(picked), atoms);
    const matched = selectResumeContent(
      p,
      analysis({ matches: [{ requirementId: 'r1', status: 'full', atomIds: picked }] }),
      atoms,
    );

    expect(holistic).toEqual(matched);
  });

  it('still yields verbatim-only content, so the fabrication guard passes', () => {
    const p = profile({
      experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: ['Shipped the thing'] }],
    });
    const atoms = buildProfileAtoms(p);

    const { content } = selectResumeContentHolistic(p, selection([atoms[0].id]), atoms);

    expect(isResumeContentVerbatim(content, p)).toBe(true);
  });

  it('ignores an atom id that matches nothing in the profile', () => {
    const p = profile({
      experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets: ['Only bullet'] }],
    });
    const atoms = buildProfileAtoms(p);

    const { content, sourceMap } = selectResumeContentHolistic(p, selection(['not-a-real-id']), atoms);

    expect(content.experience[0].bullets).toEqual(['Only bullet']);
    expect(sourceMap).toEqual([]);
  });
});
