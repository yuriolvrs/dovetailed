// What this file is: unit tests for the job/project-document generation
// prompt and its response validator -- confirming the prompt carries the
// anti-fabrication rules for bullets while allowing rewording, and that
// malformed model output is rejected.
// In plain terms: tests that we ask the AI properly and refuse bad answers.

import { describe, expect, it } from 'vitest';
import { buildGenerateEntryFromDocumentPrompt, isGeneratedEntry } from './generateEntryFromDocument';

const VALID_EXPERIENCE = {
  kind: 'experience',
  experience: { company: 'Acme', title: 'Engineer', startYear: '2021' },
  bullets: ['Did a thing well'],
};

const VALID_PROJECT = {
  kind: 'project',
  project: { name: 'Side Project', description: 'A thing I built' },
  bullets: ['Built a thing'],
};

describe('buildGenerateEntryFromDocumentPrompt', () => {
  it('includes the document text', () => {
    expect(buildGenerateEntryFromDocumentPrompt('MY JOB DESCRIPTION')).toContain('MY JOB DESCRIPTION');
  });

  it('states the anti-fabrication rule while allowing rephrasing', () => {
    const prompt = buildGenerateEntryFromDocumentPrompt('x');
    expect(prompt).toMatch(/do not add any skill, technology, tool, metric/i);
    expect(prompt).toMatch(/may rephrase and condense/i);
  });

  it('asks the model to classify experience vs project', () => {
    expect(buildGenerateEntryFromDocumentPrompt('x')).toMatch(/"experience".*"project"/s);
  });

  it('truncates a very long document instead of sending it whole', () => {
    const prompt = buildGenerateEntryFromDocumentPrompt('y'.repeat(50_000));
    expect(prompt.length).toBeLessThan(20_000);
  });
});

describe('isGeneratedEntry', () => {
  it('accepts a well-formed experience entry', () => {
    expect(isGeneratedEntry(VALID_EXPERIENCE)).toBe(true);
  });

  it('accepts a well-formed project entry', () => {
    expect(isGeneratedEntry(VALID_PROJECT)).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(isGeneratedEntry(null)).toBe(false);
    expect(isGeneratedEntry('nope')).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(isGeneratedEntry({ ...VALID_EXPERIENCE, kind: 'education' })).toBe(false);
  });

  it('rejects experience kind missing the experience field', () => {
    expect(isGeneratedEntry({ kind: 'experience', bullets: ['x'] })).toBe(false);
  });

  it('rejects project kind missing the project field', () => {
    expect(isGeneratedEntry({ kind: 'project', bullets: ['x'] })).toBe(false);
  });

  it('rejects bullets returned as a bare string instead of an array', () => {
    expect(isGeneratedEntry({ ...VALID_EXPERIENCE, bullets: 'Did a thing' })).toBe(false);
  });

  it('rejects an empty bullet', () => {
    expect(isGeneratedEntry({ ...VALID_EXPERIENCE, bullets: ['Did a thing', '  '] })).toBe(false);
  });

  it('rejects a wrongly-typed experience field', () => {
    expect(isGeneratedEntry({ ...VALID_EXPERIENCE, experience: { company: 42 } })).toBe(false);
  });
});
