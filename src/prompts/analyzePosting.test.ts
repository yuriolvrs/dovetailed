// What this file is: unit tests for the posting-extraction prompt builder,
// response validator, and the raw-extraction-to-stored-JobAnalysis mapper.
// Matching (which profile evidence supports each requirement) is tested
// separately in src/lib/matching/ -- this call never sees the profile.
// In plain terms: tests proving the "read this job posting" prompt is built
// correctly, we correctly recognize a good vs. bad AI reply, and extracted
// requirements get sensible ids/order when stored.

import { describe, expect, it } from 'vitest';
import { buildAnalyzePostingPrompt, isExtractedAnalysis, MAX_POSTING_CHARS, toJobAnalysis } from './analyzePosting';

const validExtracted = {
  roleSummary: 'A frontend role.',
  requirements: [{ text: '5+ years React', severity: 'required' as const }],
  keywords: ['React', 'TypeScript'],
};

describe('isExtractedAnalysis', () => {
  it('accepts optional title/company/location strings and rejects other types', () => {
    expect(isExtractedAnalysis({ ...validExtracted, title: 'X', company: '', location: 'Y', arrangement: 'Hybrid' })).toBe(true);
    expect(isExtractedAnalysis({ ...validExtracted, company: 7 })).toBe(false);
  });

  it('accepts a fully-populated valid extraction', () => {
    expect(isExtractedAnalysis(validExtracted)).toBe(true);
  });

  it('accepts an extraction with all-empty list fields', () => {
    expect(isExtractedAnalysis({ roleSummary: '', requirements: [], keywords: [] })).toBe(true);
  });

  it('rejects null, a string, and an array', () => {
    expect(isExtractedAnalysis(null)).toBe(false);
    expect(isExtractedAnalysis('nope')).toBe(false);
    expect(isExtractedAnalysis([])).toBe(false);
  });

  it('rejects a missing or non-string roleSummary', () => {
    const { roleSummary: _omit, ...rest } = validExtracted;
    expect(isExtractedAnalysis(rest)).toBe(false);
    expect(isExtractedAnalysis({ ...validExtracted, roleSummary: 42 })).toBe(false);
  });

  it('rejects non-array list fields', () => {
    expect(isExtractedAnalysis({ ...validExtracted, keywords: 'not an array' })).toBe(false);
  });

  it('rejects a keyword list with a non-string element', () => {
    expect(isExtractedAnalysis({ ...validExtracted, keywords: ['a', 3] })).toBe(false);
  });

  it('rejects a requirement missing severity', () => {
    expect(isExtractedAnalysis({ ...validExtracted, requirements: [{ text: 'x' }] })).toBe(false);
  });

  it('rejects a requirement with an invalid severity value', () => {
    expect(
      isExtractedAnalysis({ ...validExtracted, requirements: [{ text: 'x', severity: 'nice-to-have' }] }),
    ).toBe(false);
  });
});

describe('buildAnalyzePostingPrompt', () => {
  it('includes the posting text and instructions', () => {
    const prompt = buildAnalyzePostingPrompt('We need a React developer.');
    expect(prompt).toContain('We need a React developer.');
    expect(prompt).toContain('roleSummary');
    expect(prompt).toContain('requirements');
    expect(prompt).toContain('severity');
    expect(prompt).toContain('keywords');
  });

  it('truncates a very long posting and drops its tail', () => {
    const longPosting = 'A'.repeat(MAX_POSTING_CHARS) + 'TAIL_MARKER';
    const prompt = buildAnalyzePostingPrompt(longPosting);
    expect(prompt).toContain('[truncated]');
    expect(prompt).not.toContain('TAIL_MARKER');
  });

  it('keeps the prompt well under the proxy body limit for pathological input', () => {
    const hugePosting = 'x'.repeat(1_000_000);
    const prompt = buildAnalyzePostingPrompt(hugePosting);
    expect(new TextEncoder().encode(prompt).length).toBeLessThan(20_000);
  });
});

describe('toJobAnalysis', () => {
  it('assigns a stable id and posting-order index to each requirement, and starts with no matches', () => {
    const analysis = toJobAnalysis(validExtracted);
    expect(analysis.roleSummary).toBe('A frontend role.');
    expect(analysis.keywords).toEqual(['React', 'TypeScript']);
    expect(analysis.matches).toEqual([]);
    expect(analysis.requirements).toHaveLength(1);
    expect(analysis.requirements[0]).toMatchObject({ text: '5+ years React', severity: 'required', order: 0 });
    expect(typeof analysis.requirements[0].id).toBe('string');
    expect(analysis.requirements[0].id).not.toBe('');
  });

  it('orders requirements by their position in the extraction output', () => {
    const analysis = toJobAnalysis({
      roleSummary: '',
      requirements: [
        { text: 'First', severity: 'required' },
        { text: 'Second', severity: 'preferred' },
      ],
      keywords: [],
    });
    expect(analysis.requirements.map((r) => r.order)).toEqual([0, 1]);
  });
});

describe('requirement kinds', () => {
  it('toJobAnalysis copies a valid kind and defaults a missing or unknown one to qualification', () => {
    const analysis = toJobAnalysis({
      roleSummary: '',
      requirements: [
        { text: 'a', severity: 'required', kind: 'duty' },
        { text: 'b', severity: 'required', kind: 'education' },
        { text: 'c', severity: 'required', kind: 'qualification' },
        { text: 'd', severity: 'required' },
        { text: 'e', severity: 'required', kind: 'nonsense' },
      ],
      keywords: [],
    });
    expect(analysis.requirements.map((r) => r.kind)).toEqual([
      'duty',
      'education',
      'qualification',
      'qualification',
      'qualification',
    ]);
  });

  it('isExtractedAnalysis accepts requirements with and without kind', () => {
    expect(isExtractedAnalysis(validExtracted)).toBe(true);
    expect(
      isExtractedAnalysis({ ...validExtracted, requirements: [{ text: 'x', severity: 'required', kind: 'duty' }] }),
    ).toBe(true);
  });

  it('the prompt asks for duties, kinds, splitting, degrees, and 14 items', () => {
    const prompt = buildAnalyzePostingPrompt('Some posting');
    expect(prompt).toContain('at most 14');
    expect(prompt).toContain('"duty"');
    expect(prompt).toContain('"education"');
    expect(prompt).toContain('"qualification"');
    expect(prompt).toContain('Split a compound requirement');
    expect(prompt).toContain('Shopify, Klaviyo, Canva');
    expect(prompt).toContain('active RN');
    expect(prompt).toContain('at most 12 skills/tools/terms');
    expect(prompt).not.toContain('Do NOT include degree');
    expect(prompt).not.toContain('Do NOT include job duties');
  });
});
