// What this file is: unit tests for jobStore.ts's pure postingLabel helper
// (the only part of this module that doesn't touch Dexie, so it's the only
// part covered by a fast unit test; the Dexie-touching functions are thin
// wrappers verified manually, same convention as profileStore.ts).
// In plain terms: tests proving the "what do we call this saved posting"
// logic picks a sensible label.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { deadlineCountdown, guessJobTitleAndCompany, postingLabel } from './jobStore';
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

describe('deadlineCountdown', () => {
  // Fixed "now" so the day-boundary cases below can't drift with the clock.
  const NOW = new Date('2026-08-19T09:00:00').getTime();
  const at = (days: number, hour = 0) =>
    new Date(`2026-08-${String(19 + days).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`).getTime();

  function withFakeNow(fn: () => void) {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fn();
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flags a deadline earlier today as due today, not overdue', () => {
    withFakeNow(() => {
      // Midnight today is already behind us, but the day itself hasn't ended.
      expect(deadlineCountdown(at(0))).toEqual({ label: 'Due today', color: 'red' });
    });
  });

  it('reports a past deadline as overdue', () => {
    withFakeNow(() => {
      expect(deadlineCountdown(at(-2))).toEqual({ label: 'Overdue 2d', color: 'red' });
    });
  });

  it('warns in amber inside the three-day window', () => {
    withFakeNow(() => {
      expect(deadlineCountdown(at(3))).toEqual({ label: '3d left', color: 'amber' });
    });
  });

  it('stays neutral when there is more than three days left', () => {
    withFakeNow(() => {
      expect(deadlineCountdown(at(4))).toEqual({ label: '4d left', color: 'slate' });
    });
  });
});
