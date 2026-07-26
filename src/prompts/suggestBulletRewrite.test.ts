// What this file is: unit tests for the bullet-rewrite suggestion prompt's
// safety filter -- confirms it blocks exactly the two fabrication patterns
// an earlier LLM-rewriting design actually produced (invented technologies,
// invented durations/quantities), while still allowing plain paraphrasing.
// In plain terms: tests proving the "suggest a rewording" feature can't
// sneak in a skill or number you didn't already write.

import { describe, expect, it } from 'vitest';
import { filterSafeSuggestions, introducesUnsupportedClaims, isRewriteSuggestions } from './suggestBulletRewrite';

describe('introducesUnsupportedClaims', () => {
  it('allows a plain paraphrase with no new proper nouns or numbers', () => {
    expect(introducesUnsupportedClaims('Fixed bugs in the billing system', 'Resolved bugs in the billing system')).toBe(
      false,
    );
  });

  it('blocks a suggestion that introduces a new capitalized technology name', () => {
    expect(
      introducesUnsupportedClaims(
        'Planned and executed events as project head',
        'Developed scalable code using Java and Spring Boot',
      ),
    ).toBe(true);
  });

  it('blocks a suggestion that introduces a new number', () => {
    expect(introducesUnsupportedClaims('Managed a small team', 'Managed a team of 12 engineers')).toBe(true);
  });

  it('allows a number that was already present in the original', () => {
    expect(introducesUnsupportedClaims('Cut load time by 40%', 'Reduced load time by 40 percent')).toBe(false);
  });
});

describe('filterSafeSuggestions', () => {
  it('keeps only suggestions that pass the unsupported-claims check', () => {
    const original = 'Wrote documentation for the API';
    const suggestions = ['Authored documentation for the API', 'Wrote documentation for the REST API using Swagger'];
    expect(filterSafeSuggestions(original, suggestions)).toEqual(['Authored documentation for the API']);
  });
});

describe('isRewriteSuggestions', () => {
  it('accepts a well-formed suggestions list', () => {
    expect(isRewriteSuggestions({ suggestions: ['a', 'b'] })).toBe(true);
  });

  it('accepts an empty list', () => {
    expect(isRewriteSuggestions({ suggestions: [] })).toBe(true);
  });

  it('rejects a non-array suggestions field', () => {
    expect(isRewriteSuggestions({ suggestions: 'nope' })).toBe(false);
  });

  it('rejects more than 3 suggestions', () => {
    expect(isRewriteSuggestions({ suggestions: ['a', 'b', 'c', 'd'] })).toBe(false);
  });

  it('rejects a blank suggestion', () => {
    expect(isRewriteSuggestions({ suggestions: ['a', '  '] })).toBe(false);
  });
});
