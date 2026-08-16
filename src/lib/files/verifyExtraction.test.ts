// What this file is: unit tests for the anti-fabrication verifier -- proving
// it catches invented text while not false-flagging text that only differs by
// markdown decoration, smart punctuation, case, or whitespace.
// In plain terms: tests that we correctly spot made-up resume content without
// crying wolf over formatting differences.

import { describe, expect, it } from 'vitest';
import type { ExtractedProfile } from '../../prompts/extractProfile';
import { isPresentInCorpus, normalizeForCompare, verifyExtractedProfile } from './verifyExtraction';

// What the document reader actually returns: markdown, not plain text.
const CORPUS = `# Rhianna Lauren A. Lim

**Senior Frontend Engineer** | Northwind Labs

## Experience

### Account Officer, Acme Bank
- Reconciled daily settlement reports across three regions
- Led the migration to a new billing system

## Skills
| Category | Items |
| --- | --- |
| Languages | TypeScript, Python |
`;

function profile(overrides: Partial<ExtractedProfile>): ExtractedProfile {
  return {
    contact: {},
    skills: [],
    experience: [],
    projects: [],
    education: [],
    ...overrides,
  };
}

describe('normalizeForCompare', () => {
  it('strips markdown decoration', () => {
    expect(normalizeForCompare('**Acme Bank**')).toBe('acme bank');
    expect(normalizeForCompare('## Experience')).toBe('experience');
    expect(normalizeForCompare('- Led the migration')).toBe('led the migration');
    expect(normalizeForCompare('| Languages | TypeScript |')).toBe('languages typescript');
  });

  it('keeps the link label and drops the target', () => {
    expect(normalizeForCompare('[my site](https://example.com)')).toBe('my site');
  });

  it('folds smart punctuation and collapses whitespace', () => {
    expect(normalizeForCompare('Company’s  cross‑functional team')).toBe(
      "company's cross-functional team",
    );
  });
});

describe('isPresentInCorpus', () => {
  it('finds text that is decorated in the document but bare in the extraction', () => {
    expect(isPresentInCorpus('Senior Frontend Engineer', CORPUS)).toBe(true);
    expect(isPresentInCorpus('Rhianna Lauren A. Lim', CORPUS)).toBe(true);
    expect(isPresentInCorpus('Led the migration to a new billing system', CORPUS)).toBe(true);
  });

  it('rejects text that is not in the document', () => {
    expect(isPresentInCorpus('Built Spring Boot microservices', CORPUS)).toBe(false);
  });

  it('treats an empty value as nothing to verify', () => {
    expect(isPresentInCorpus('', CORPUS)).toBe(true);
  });
});

describe('verifyExtractedProfile', () => {
  it('passes an extraction copied verbatim from the document', () => {
    const result = verifyExtractedProfile(
      profile({
        contact: { name: 'Rhianna Lauren A. Lim' },
        skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
        experience: [
          {
            company: 'Acme Bank',
            title: 'Account Officer',
            bullets: ['Reconciled daily settlement reports across three regions'],
          },
        ],
      }),
      CORPUS,
    );
    expect(result).toEqual([]);
  });

  it('flags an invented bullet with a locator pointing at it', () => {
    const result = verifyExtractedProfile(
      profile({
        experience: [
          {
            company: 'Acme Bank',
            title: 'Account Officer',
            bullets: [
              'Reconciled daily settlement reports across three regions',
              'Developed scalable Java and Spring Framework microservices',
            ],
          },
        ],
      }),
      CORPUS,
    );

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('experience.0.bullets.1');
    expect(result[0].text).toContain('Spring Framework');
  });

  it('flags an invented skill', () => {
    const result = verifyExtractedProfile(
      profile({ skills: [{ category: 'Languages', items: ['TypeScript', 'Rust'] }] }),
      CORPUS,
    );
    expect(result.map((r) => r.text)).toEqual(['Rust']);
  });

  it('does not flag dates, which are reformatted by design', () => {
    const result = verifyExtractedProfile(
      profile({
        experience: [
          { company: 'Acme Bank', title: 'Account Officer', startMonth: 'March', startYear: '2019', bullets: [] },
        ],
      }),
      CORPUS,
    );
    expect(result).toEqual([]);
  });

  it('flags everything when the document yielded nothing', () => {
    const result = verifyExtractedProfile(
      profile({ contact: { name: 'Someone Else' }, skills: [{ category: 'X', items: ['Go'] }] }),
      '',
    );
    expect(result).toHaveLength(2);
  });
});
