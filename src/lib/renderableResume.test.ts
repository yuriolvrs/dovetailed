// What this file is: unit tests for the "no bullets, no entry" render rule --
// confirms bullet-less experience and project entries are dropped, entries
// that still have bullets are untouched, education is left alone, and the
// input object is never mutated.
// In plain terms: tests proving an emptied job or project vanishes from the
// resume while everything else stays exactly as it was.

import { describe, expect, it } from 'vitest';
import { experienceFirst, visibleLocation, withRenderableEntries } from './renderableResume';
import type { ResumeContent } from '../types';

function content(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    contact: { name: 'A', email: 'a@b.c', links: [] },
    skills: [],
    experience: [],
    projects: [],
    education: [],
    ...overrides,
  };
}

const job = (title: string, bullets: string[]) => ({ company: 'Co', title, current: false, bullets });
const project = (name: string, bullets: string[]) => ({ name, description: '', bullets, links: [] });

describe('withRenderableEntries', () => {
  it('drops experience entries left with no bullets', () => {
    const c = content({ experience: [job('Kept', ['a bullet']), job('Emptied', [])] });
    expect(withRenderableEntries(c).experience.map((e) => e.title)).toEqual(['Kept']);
  });

  it('keeps a named project with no bullets and no description', () => {
    const c = content({ projects: [project('Name only', []), project('Kept', ['a bullet'])] });
    expect(withRenderableEntries(c).projects.map((p) => p.name)).toEqual(['Name only', 'Kept']);
  });

  it('drops a project with a blank name', () => {
    const c = content({ projects: [project('  ', ['a bullet']), project('Kept', [])] });
    expect(withRenderableEntries(c).projects.map((p) => p.name)).toEqual(['Kept']);
  });

  it('keeps education entries with no detail bullets', () => {
    const school = { school: 'DLSU', degree: 'BS', current: false, details: [] };
    expect(withRenderableEntries(content({ education: [school] })).education).toEqual([school]);
  });

  it('leaves the input untouched', () => {
    const c = content({ experience: [job('Emptied', [])] });
    withRenderableEntries(c);
    expect(c.experience).toHaveLength(1);
  });
});

describe('withRenderableEntries: described projects', () => {
  it('keeps a project with a description but no bullets', () => {
    const c = content({ projects: [{ name: 'Thesis', description: 'Logo and flyers', bullets: [], links: [] }] });
    expect(withRenderableEntries(c).projects.map((p) => p.name)).toEqual(['Thesis']);
  });
});

describe('visibleLocation', () => {
  it('hides a location the company text already contains', () => {
    expect(visibleLocation('Riverbend Community Hospital, Vancouver, WA', 'Vancouver, WA')).toBe('');
  });

  it('shows a location the company text does not contain', () => {
    expect(visibleLocation('Acme', 'Boston, MA')).toBe('Boston, MA');
  });

  it('returns empty for a missing location', () => {
    expect(visibleLocation('Acme', undefined)).toBe('');
  });
});

describe('experienceFirst', () => {
  it('is true with an experience entry and false without', () => {
    expect(experienceFirst(content({ experience: [job('A', ['x'])] }))).toBe(true);
    expect(experienceFirst(content())).toBe(false);
  });
});
