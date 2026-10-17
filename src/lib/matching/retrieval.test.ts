// What this file is: unit tests for retrieveCandidates -- confirms
// synonym-aware overlap scoring surfaces plausible atoms (including the
// motivating "Java" skill / "JVM ecosystem" requirement case) and returns
// nothing when there's no plausible overlap.
// In plain terms: tests proving the cheap local matching step finds the
// right profile evidence to hand to the LLM for verification.

import { describe, expect, it } from 'vitest';
import { retrieveCandidates } from './retrieval';
import type { ProfileAtom } from '../../types';

function atom(overrides: Partial<ProfileAtom>): ProfileAtom {
  return { id: 'a', source: 'skills', sourceLabel: 'Skills', text: '', ...overrides };
}

describe('retrieveCandidates', () => {
  it('offers everyday evidence for a customer-service or language requirement', () => {
    const atoms = [
      atom({ id: 'phones', source: 'experience', text: 'Answered vendor phone and email questions' }),
      atom({ id: 'lang', text: 'Spanish (conversational)' }),
      atom({ id: 'gl', text: 'Journal entries' }),
    ];
    const service = retrieveCandidates('1-2 years of experience in customer service', atoms).map((c) => c.atom.id);
    expect(service).toContain('phones');
    expect(service).not.toContain('gl');
    expect(retrieveCandidates('Bilingual preferred', atoms).map((c) => c.atom.id)).toContain('lang');
  });

  it('matches a requirement phrased with a synonym not literally in the profile', () => {
    const atoms = [atom({ id: 'java', text: 'Java' }), atom({ id: 'python', text: 'Python' })];
    const candidates = retrieveCandidates('Solid experience with Java and the JVM ecosystem', atoms);
    expect(candidates.map((c) => c.atom.id)).toContain('java');
    expect(candidates.map((c) => c.atom.id)).not.toContain('python');
  });

  it('matches a multi-word synonym phrase (Spring MVC vs Spring)', () => {
    const atoms = [atom({ id: 'spring', text: 'Spring' })];
    const candidates = retrieveCandidates('3+ years with Spring MVC', atoms);
    expect(candidates.map((c) => c.atom.id)).toContain('spring');
  });

  it('returns nothing when no atom clears the score floor', () => {
    const atoms = [atom({ text: 'Photoshop' }), atom({ text: 'Illustrator' })];
    const candidates = retrieveCandidates('Experience with Kubernetes and Docker', atoms);
    expect(candidates).toEqual([]);
  });

  it('caps results at k and sorts by descending score', () => {
    const atoms = Array.from({ length: 10 }, (_, i) => atom({ id: `js-${i}`, text: 'JavaScript' }));
    const candidates = retrieveCandidates('JavaScript required', atoms, 3);
    expect(candidates).toHaveLength(3);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });

  it('matches a phrase synonym across a unicode (non-ASCII) hyphen', () => {
    // Job postings often spell "e-commerce" with a non-breaking hyphen
    // (U+2011) rather than a plain "-"; the synonym group is written
    // space-separated so both spellings normalize to the same match.
    const atoms = [atom({ id: 'ecom', sourceLabel: 'E-Commerce Operator', text: 'Product listing and SKU assignment' })];
    const candidates = retrieveCandidates('exposure to digital or e‑commerce', atoms);
    expect(candidates.map((c) => c.atom.id)).toContain('ecom');
  });

  it('matches "PowerPoint and Excel" to a general "Microsoft Office" skill', () => {
    const atoms = [atom({ id: 'msoffice', text: 'Microsoft Office' })];
    const candidates = retrieveCandidates('Proficient in PowerPoint and Excel', atoms);
    expect(candidates.map((c) => c.atom.id)).toContain('msoffice');
  });

  it('matches "digital content and creative development" to Canva/Photography skills', () => {
    const atoms = [
      atom({ id: 'photo', text: 'Photography' }),
      atom({ id: 'canva', text: 'Knowledge in editing presentations in Canva and photos' }),
    ];
    const candidates = retrieveCandidates('Interest in digital content and creative development', atoms);
    expect(candidates.map((c) => c.atom.id)).toEqual(expect.arrayContaining(['photo', 'canva']));
  });
});
