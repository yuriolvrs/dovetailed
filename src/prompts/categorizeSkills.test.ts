// What this file is: unit tests for the "AI Categorize" skills feature's
// safety filter -- confirms it can't add a skill the model invented and
// can't drop a skill the user actually typed.
// In plain terms: tests proving the AI-categorize button can't sneak in a
// fake skill or silently lose a real one.

import { describe, expect, it } from 'vitest';
import { isCategorizeSkillsResult, reconcileCategorization } from './categorizeSkills';

describe('reconcileCategorization', () => {
  it('keeps a well-formed grouping as-is', () => {
    const result = reconcileCategorization(['React', 'Leadership'], {
      categories: [
        { category: 'Technical', items: ['React'] },
        { category: 'Soft Skills', items: ['Leadership'] },
      ],
    });
    expect(result).toEqual([
      { category: 'Technical', items: ['React'] },
      { category: 'Soft Skills', items: ['Leadership'] },
    ]);
  });

  it('drops a skill the model invented that was never in the original list', () => {
    const result = reconcileCategorization(['React'], {
      categories: [{ category: 'Technical', items: ['React', 'Kubernetes'] }],
    });
    expect(result).toEqual([{ category: 'Technical', items: ['React'] }]);
  });

  it('matches case/whitespace-insensitively but preserves original casing', () => {
    const result = reconcileCategorization(['Project Management'], {
      categories: [{ category: 'Ops', items: [' project management '] }],
    });
    expect(result).toEqual([{ category: 'Ops', items: ['Project Management'] }]);
  });

  it('puts a dropped original skill back under "Other"', () => {
    const result = reconcileCategorization(['React', 'Photography'], {
      categories: [{ category: 'Technical', items: ['React'] }],
    });
    expect(result).toEqual([
      { category: 'Technical', items: ['React'] },
      { category: 'Other', items: ['Photography'] },
    ]);
  });

  it('drops a duplicate if the model lists the same skill in two categories', () => {
    const result = reconcileCategorization(['React'], {
      categories: [
        { category: 'Technical', items: ['React'] },
        { category: 'Frontend', items: ['React'] },
      ],
    });
    expect(result).toEqual([{ category: 'Technical', items: ['React'] }]);
  });
});

describe('isCategorizeSkillsResult', () => {
  it('accepts a well-formed result', () => {
    expect(isCategorizeSkillsResult({ categories: [{ category: 'Technical', items: ['React'] }] })).toBe(true);
  });

  it('rejects an empty categories list', () => {
    expect(isCategorizeSkillsResult({ categories: [] })).toBe(false);
  });

  it('rejects a category missing an items array', () => {
    expect(isCategorizeSkillsResult({ categories: [{ category: 'Technical' }] })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isCategorizeSkillsResult('nope')).toBe(false);
  });
});
