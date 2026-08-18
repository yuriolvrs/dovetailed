// What this file is: unit tests for the "no bullets, no entry" render rule --
// confirms bullet-less experience and project entries are dropped, entries
// that still have bullets are untouched, education is left alone, and the
// input object is never mutated.
// In plain terms: tests proving an emptied job or project vanishes from the
// resume while everything else stays exactly as it was.

import { describe, expect, it } from 'vitest';
import { withRenderableEntries } from './renderableResume';
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

  it('drops projects left with no bullets', () => {
    const c = content({ projects: [project('Emptied', []), project('Kept', ['a bullet'])] });
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
