// What this file is: unit tests for the deterministic resume-selection
// logic -- confirms every bullet/skill in the output is copied verbatim
// (never rewritten), matched items are prioritized/reordered but nothing is
// ever dropped from a bullet's text, experience entries are always kept,
// and projects are ranked/capped by matched-evidence count.
// In plain terms: tests proving the "build a tailored resume" step only
// ever selects and reorders your real content, never invents anything.

import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_BULLET_CAP,
  isResumeContentVerbatim,
  MAX_PROJECTS,
  PROJECT_BULLET_CAP,
  selectResumeContent,
} from './selectResumeContent';
import type { JobAnalysis, Profile, ProfileAtom, ResumeContent } from '../../types';
import { emptyProfile } from '../profileStore';
import { buildProfileAtoms } from '../profileAtoms';

function profile(overrides: Partial<Profile> = {}): Profile {
  return { ...emptyProfile(), ...overrides };
}

function analysis(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return { roleSummary: '', requirements: [], keywords: [], matches: [], ...overrides };
}

describe('selectResumeContent', () => {
  it('copies contact/summary/education verbatim', () => {
    const p = profile({
      contact: { name: 'Jane Doe', email: 'jane@x.com', links: [] },
      summary: 'A summary.',
      education: [{ school: 'MIT', degree: 'B.S.', current: false }],
    });
    const { content } = selectResumeContent(p, analysis(), []);
    expect(content.contact).toEqual(p.contact);
    expect(content.summary).toBe('A summary.');
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

  it('caps bullets per experience entry at EXPERIENCE_BULLET_CAP', () => {
    const bullets = Array.from({ length: EXPERIENCE_BULLET_CAP + 3 }, (_, i) => `Bullet ${i}`);
    const p = profile({ experience: [{ company: 'Acme', title: 'Engineer', current: true, bullets }] });
    const atoms = buildProfileAtoms(p);
    const { content } = selectResumeContent(p, analysis(), atoms);
    expect(content.experience[0].bullets).toHaveLength(EXPERIENCE_BULLET_CAP);
  });

  it('caps bullets per project at PROJECT_BULLET_CAP', () => {
    const bullets = Array.from({ length: PROJECT_BULLET_CAP + 3 }, (_, i) => `Bullet ${i}`);
    const p = profile({ projects: [{ name: 'Alpha', description: '', bullets, links: [] }] });
    const atoms = buildProfileAtoms(p);
    const { content } = selectResumeContent(p, analysis(), atoms);
    expect(content.projects[0].bullets).toHaveLength(PROJECT_BULLET_CAP);
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
