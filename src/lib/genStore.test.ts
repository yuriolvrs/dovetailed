// What this file is: unit tests for migrateGeneration -- the migration that
// fixes up a resume generation saved under an older schema (flat
// string[] skills, from before categories were reintroduced) so it still
// renders instead of crashing (SkillsForm/ResumePrintView expect
// SkillGroup[]). Real bug this caught: opening an old saved resume threw
// inside <TagInput>, blank-screening the whole page.
// In plain terms: tests proving an old saved resume still opens correctly
// under today's category-grouped skills shape.

import { describe, expect, it } from 'vitest';
import { migrateGeneration } from './genStore';
import type { Generation } from '../types';

function resumeGeneration(skills: unknown): Generation {
  return {
    id: 'x:resume',
    jobPostingId: 'x',
    createdAt: 0,
    type: 'resume',
    content: {
      contact: { name: '', email: '', links: [] },
      skills: skills as never,
      experience: [],
      projects: [],
      education: [],
    },
    sourceMap: [],
  };
}

describe('migrateGeneration', () => {
  it('wraps an old flat skills string[] into one category group', () => {
    const migrated = migrateGeneration(resumeGeneration(['Java', 'Python']));
    expect(migrated.content).toMatchObject({ skills: [{ category: 'Skills', items: ['Java', 'Python'] }] });
  });

  it('leaves an already-grouped skills shape unchanged', () => {
    const grouped = [{ category: 'Languages', items: ['Java'] }];
    const migrated = migrateGeneration(resumeGeneration(grouped));
    expect(migrated.content).toMatchObject({ skills: grouped });
  });

  it('leaves a non-resume generation untouched', () => {
    const coverLetter: Generation = {
      id: 'x:coverLetter',
      jobPostingId: 'x',
      createdAt: 0,
      type: 'coverLetter',
      content: { greeting: '', paragraphs: [], closing: '' },
      sourceMap: [],
    };
    expect(migrateGeneration(coverLetter)).toBe(coverLetter);
  });
});
