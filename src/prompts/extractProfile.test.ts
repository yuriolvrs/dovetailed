// What this file is: unit tests for the resume-extraction prompt and its
// response validator -- confirming the prompt carries the anti-fabrication
// rules and that malformed model output is rejected so generateStructured
// retries instead of handing a broken shape to the review screen.
// In plain terms: tests that we ask the AI properly and refuse bad answers.

import { describe, expect, it } from 'vitest';
import { buildExtractProfilePrompt, cleanSpelling, isExtractedProfile } from './extractProfile';

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

  it('accepts contact links as strings and rejects other shapes', () => {
    const base = { contact: {}, skills: [], experience: [], projects: [], education: [] };
    expect(isExtractedProfile({ ...base, contact: { links: ['github.com/x'] } })).toBe(true);
    expect(isExtractedProfile({ ...base, contact: { links: [{ url: 'x' }] } })).toBe(false);
  });

  it('rejects a contact field of the wrong type', () => {
    expect(isExtractedProfile({ ...VALID, contact: { name: 42 } })).toBe(false);
  });
});

describe('summary and company/location rules', () => {
  it('asks for the summary verbatim and shows it in the JSON shape', () => {
    const prompt = buildExtractProfilePrompt('x');
    expect(prompt).toMatch(/"summary"/);
    expect(prompt).toMatch(/summary[^\n]*verbatim/i);
  });

  it('tells the model to keep company and location apart', () => {
    expect(buildExtractProfilePrompt('x')).toMatch(/never inside "company"/);
  });

  it('accepts a string summary and rejects a non-string one', () => {
    expect(isExtractedProfile({ ...VALID, summary: 'Hello' })).toBe(true);
    expect(isExtractedProfile({ ...VALID, summary: 5 })).toBe(false);
  });
});

describe('spelling notes', () => {
  it('asks for spelling notes and says not to correct the text', () => {
    const prompt = buildExtractProfilePrompt('x');
    expect(prompt).toContain('"spelling"');
    expect(prompt).toContain('do NOT fix the typo');
  });

  it('never rejects a reply because of a malformed spelling field', () => {
    expect(isExtractedProfile({ ...VALID, spelling: 'oops' })).toBe(true);
    expect(isExtractedProfile({ ...VALID, spelling: [{ text: 'experiance', suggestion: 'experience' }] })).toBe(true);
  });

  it('keeps well-formed notes and ignores malformed ones', () => {
    expect(cleanSpelling('oops')).toEqual([]);
    expect(cleanSpelling(undefined)).toEqual([]);
    expect(
      cleanSpelling([
        { text: 'experiance', suggestion: 'experience' },
        { text: 'same', suggestion: 'same' },
        { text: 5, suggestion: 'x' },
        null,
        { text: '', suggestion: 'x' },
      ]),
    ).toEqual([{ text: 'experiance', suggestion: 'experience' }]);
  });
});
