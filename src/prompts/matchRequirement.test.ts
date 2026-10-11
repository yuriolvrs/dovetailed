// What this file is: unit tests for the matching-verification prompt and its
// response guard -- confirms candidate ids/text are embedded in the prompt
// and the guard accepts/rejects the expected shapes.
// In plain terms: tests proving we ask the AI correctly and only trust
// well-shaped answers.

import { describe, expect, it } from 'vitest';
import {
  buildBatchMatchPrompt,
  buildMatchRequirementPrompt,
  isBatchMatchVerification,
  isMatchVerification,
} from './matchRequirement';

describe('buildMatchRequirementPrompt', () => {
  it('embeds the requirement and each candidate id/label/text', () => {
    const prompt = buildMatchRequirementPrompt('3+ years with Java', [
      { id: 'skills-abc', text: 'Java', sourceLabel: 'Skills' },
    ]);
    expect(prompt).toContain('3+ years with Java');
    expect(prompt).toContain('skills-abc');
    expect(prompt).toContain('Skills');
    expect(prompt).toContain('"Java"');
  });
});

describe('isMatchVerification', () => {
  it('accepts a full match', () => {
    expect(isMatchVerification({ atomIds: ['a'], status: 'full' })).toBe(true);
  });

  it('accepts a partial match', () => {
    expect(isMatchVerification({ atomIds: ['a'], status: 'partial' })).toBe(true);
  });

  it('accepts an empty atomIds array', () => {
    expect(isMatchVerification({ atomIds: [], status: 'full' })).toBe(true);
  });

  it('rejects a missing status', () => {
    expect(isMatchVerification({ atomIds: [] })).toBe(false);
  });

  it('rejects an invalid status value', () => {
    expect(isMatchVerification({ atomIds: [], status: 'yes' })).toBe(false);
  });

  it('rejects atomIds that is a bare string instead of an array', () => {
    expect(isMatchVerification({ atomIds: 'a', status: 'full' })).toBe(false);
  });
});

describe('buildBatchMatchPrompt', () => {
  it('lists each requirement under its label with only its own candidates', () => {
    const prompt = buildBatchMatchPrompt([
      { label: 'R1', requirementText: 'Java', candidates: [{ id: 'skills-java', text: 'Java', sourceLabel: 'Skills' }] },
      { label: 'R2', requirementText: 'Python', candidates: [{ id: 'skills-py', text: 'Python', sourceLabel: 'Skills' }] },
    ]);
    const r1 = prompt.slice(prompt.indexOf('=== R1 ==='), prompt.indexOf('=== R2 ==='));
    expect(r1).toContain('skills-java');
    expect(r1).not.toContain('skills-py');
    expect(prompt).toContain('(R1, R2)');
  });
});

describe('isBatchMatchVerification', () => {
  it('accepts labelled results and rejects malformed ones', () => {
    expect(isBatchMatchVerification({ results: [{ requirement: 'R1', atomIds: [], status: 'full' }] })).toBe(true);
    expect(isBatchMatchVerification({ results: [{ atomIds: [], status: 'full' }] })).toBe(false);
    expect(isBatchMatchVerification({ results: [{ requirement: 'R1', atomIds: 'x', status: 'full' }] })).toBe(false);
    expect(isBatchMatchVerification({})).toBe(false);
  });
});
