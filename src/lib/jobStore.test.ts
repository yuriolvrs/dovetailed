// What this file is: unit tests for jobStore.ts's pure postingLabel helper
// (the only part of this module that doesn't touch Dexie, so it's the only
// part covered by a fast unit test; the Dexie-touching functions are thin
// wrappers verified manually, same convention as profileStore.ts).
// In plain terms: tests proving the "what do we call this saved posting"
// logic picks a sensible label.

import { describe, expect, it } from 'vitest';
import { guessJobTitleAndCompany, postingLabel } from './jobStore';
import type { JobPosting } from '../types';

function posting(overrides: Partial<JobPosting>): JobPosting {
  return { id: 'x', createdAt: 0, rawText: '', ...overrides };
}

describe('postingLabel', () => {
  it('prefers an explicit title over the analysis role summary', () => {
    const p = posting({
      title: 'Staff Engineer',
      rawText: 'Some raw text',
      analysis: {
        roleSummary: 'Senior Frontend Engineer',
        requirements: [],
        keywords: [],
        matches: [],
      },
    });
    expect(postingLabel(p)).toBe('Staff Engineer');
  });

  it('prefers the analysis role summary', () => {
    const p = posting({
      rawText: 'Some raw text',
      analysis: {
        roleSummary: 'Senior Frontend Engineer',
        requirements: [],
        keywords: [],
        matches: [],
      },
    });
    expect(postingLabel(p)).toBe('Senior Frontend Engineer');
  });

  it('falls back to the first non-empty line of rawText', () => {
    const p = posting({ rawText: '\n  \nApply now: Backend Engineer\nMore details below.' });
    expect(postingLabel(p)).toBe('Apply now: Backend Engineer');
  });

  it('falls back to "Untitled posting" for blank text and no analysis', () => {
    expect(postingLabel(posting({ rawText: '   \n  ' }))).toBe('Untitled posting');
  });

  it('truncates a long label to 80 chars ending in an ellipsis', () => {
    const longLine = 'A'.repeat(200);
    const label = postingLabel(posting({ rawText: longLine }));
    expect(label.length).toBe(81);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('guessJobTitleAndCompany', () => {
  it('takes the first line as the title when it reads like a title, not a sentence', () => {
    const { title } = guessJobTitleAndCompany('Senior Frontend Engineer\nAbout the role...');
    expect(title).toBe('Senior Frontend Engineer');
  });

  it('does not guess a title from a first line that ends in a period', () => {
    const { title } = guessJobTitleAndCompany('We are hiring for this role.\nMore details.');
    expect(title).toBeUndefined();
  });

  it('finds a company from a "Company:" line', () => {
    const { company } = guessJobTitleAndCompany('Senior Frontend Engineer\nCompany: Acme Co.\nDetails...');
    expect(company).toBe('Acme Co.');
  });

  it('finds a company from an "at X" line', () => {
    const { company } = guessJobTitleAndCompany('Senior Frontend Engineer\nat Nimbus Labs\nDetails...');
    expect(company).toBe('Nimbus Labs');
  });

  it('returns no company when nothing matches', () => {
    const { company } = guessJobTitleAndCompany('Senior Frontend Engineer\nAbout the role...');
    expect(company).toBeUndefined();
  });

  it('returns nothing for blank text', () => {
    expect(guessJobTitleAndCompany('   \n  ')).toEqual({ title: undefined, company: undefined });
  });

  it('does not mistake a sentence starting with "At" for a company line', () => {
    const { company } = guessJobTitleAndCompany(
      'Senior Frontend Engineer\nAt least 3 years of experience with React required.\nDetails...',
    );
    expect(company).toBeUndefined();
  });
});
