// What this file is: unit tests for the anti-fabrication check on
// document-generated profile entries -- confirming it flags a bullet that
// mentions a skill/tool/number the source document never mentioned, while
// leaving a faithful rewording alone.
// In plain terms: tests that we catch the AI sneaking something into a
// generated bullet that isn't actually in the document you uploaded.

import { describe, expect, it } from 'vitest';
import { unverifiedBullets } from './verifyGeneratedEntry';

const DOCUMENT = `Job Description: Marketing Coordinator at Acme Corp.
Responsibilities include managing email correspondence, coordinating with
external creative agencies, and organizing quarterly campaign reviews.`;

describe('unverifiedBullets', () => {
  it('accepts a faithful rewording that stays within the document', () => {
    const bullets = ['Managed email correspondence and coordinated with external creative agencies'];
    expect(unverifiedBullets(bullets, DOCUMENT)).toEqual([]);
  });

  it('flags a bullet that introduces a technology not in the document', () => {
    const bullets = ['Managed email campaigns using HubSpot and Salesforce'];
    const result = unverifiedBullets(bullets, DOCUMENT);
    expect(result).toHaveLength(1);
    expect(result[0].terms).toEqual(expect.arrayContaining(['hubspot', 'salesforce']));
  });

  it('flags a bullet that introduces a number not in the document', () => {
    const bullets = ['Managed email correspondence for a team of 12'];
    const result = unverifiedBullets(bullets, DOCUMENT);
    expect(result).toHaveLength(1);
    expect(result[0].terms).toEqual(['12']);
  });

  it('allows a term the document actually contains, even capitalized', () => {
    const bullets = ['Coordinated campaign reviews on behalf of Acme Corp'];
    expect(unverifiedBullets(bullets, DOCUMENT)).toEqual([]);
  });

  it('reports the correct bullet index among several', () => {
    const bullets = [
      'Managed email correspondence',
      'Coordinated with external creative agencies',
      'Increased quarterly revenue by 40%',
    ];
    const result = unverifiedBullets(bullets, DOCUMENT);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(2);
  });
});
