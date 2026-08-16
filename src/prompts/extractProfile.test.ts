// What this file is: unit tests for the resume-extraction prompt and its
// response validator -- confirming the prompt carries the anti-fabrication
// rules and that malformed model output is rejected so generateStructured
// retries instead of handing a broken shape to the review screen.
// In plain terms: tests that we ask the AI properly and refuse bad answers.

import { describe, expect, it } from 'vitest';
import { buildExtractProfilePrompt, isExtractedProfile } from './extractProfile';

const VALID = {
  contact: { name: 'A Person', email: 'a@example.com' },
  skills: [{ category: 'Languages', items: ['TypeScript'] }],
  experience: [{ company: 'Acme', title: 'Engineer', bullets: ['Did a thing'] }],
  projects: [{ name: 'Thing', description: 'Does stuff', bullets: [] }],
  education: [{ school: 'A University', degree: 'BS' }],
};

describe('buildExtractProfilePrompt', () => {
  it('includes the document text', () => {
    expect(buildExtractProfilePrompt('MY RESUME TEXT')).toContain('MY RESUME TEXT');
  });

  it('states the anti-fabrication rules', () => {
    const prompt = buildExtractProfilePrompt('x');
    expect(prompt).toContain('VERBATIM');
    expect(prompt).toMatch(/do not infer, guess, or invent/i);
  });

  it('warns that the input is markdown, since the reader returns markdown', () => {
    expect(buildExtractProfilePrompt('x')).toMatch(/markdown/i);
  });

  it('truncates a very long document instead of sending it whole', () => {
    const prompt = buildExtractProfilePrompt('y'.repeat(50_000));
    expect(prompt.length).toBeLessThan(25_000);
  });
});

describe('isExtractedProfile', () => {
  it('accepts a well-formed extraction', () => {
    expect(isExtractedProfile(VALID)).toBe(true);
  });

  it('accepts empty sections', () => {
    expect(
      isExtractedProfile({ contact: {}, skills: [], experience: [], projects: [], education: [] }),
    ).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(isExtractedProfile(null)).toBe(false);
    expect(isExtractedProfile('nope')).toBe(false);
    expect(isExtractedProfile([])).toBe(false);
  });

  it('rejects missing top-level sections', () => {
    expect(isExtractedProfile({ ...VALID, skills: undefined })).toBe(false);
    expect(isExtractedProfile({ ...VALID, experience: undefined })).toBe(false);
  });

  it('rejects bullets returned as a bare string instead of an array', () => {
    // The exact failure mode seen from small models in earlier phases.
    expect(
      isExtractedProfile({
        ...VALID,
        experience: [{ company: 'Acme', title: 'Engineer', bullets: 'Did a thing' }],
      }),
    ).toBe(false);
  });

  it('rejects a skill group whose items contain non-strings', () => {
    expect(
      isExtractedProfile({ ...VALID, skills: [{ category: 'Languages', items: ['ok', 42] }] }),
    ).toBe(false);
  });

  it('rejects an experience entry missing company or title', () => {
    expect(isExtractedProfile({ ...VALID, experience: [{ title: 'Engineer', bullets: [] }] })).toBe(false);
  });

  it('rejects a contact field of the wrong type', () => {
    expect(isExtractedProfile({ ...VALID, contact: { name: 42 } })).toBe(false);
  });
});
