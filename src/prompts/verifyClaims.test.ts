// What this file is: unit tests for the claim check prompts and validators.
// In plain terms: tests proving the claim check asks the right question and reads the reply safely.

import { describe, expect, it } from 'vitest';
import {
  buildRepairClaimsPrompt,
  buildVerifyClaimsPrompt,
  isClaimRepairs,
  isClaimVerification,
} from './verifyClaims';

const item = { index: 3, sentence: 'I managed no-show tracking.', evidence: ['Made a spreadsheet to track no-shows'] };

describe('verify prompt', () => {
  it('lists each sentence with its index and evidence and states the support rule', () => {
    const prompt = buildVerifyClaimsPrompt([item]);
    expect(prompt).toContain('[3] sentence: "I managed no-show tracking."');
    expect(prompt).toContain('Made a spreadsheet to track no-shows');
    expect(prompt).toContain('stated or directly implied');
    expect(prompt).toContain('{"results":[');
  });
});

describe('repair prompt', () => {
  it('carries the issue and asks for the repairs shape', () => {
    const prompt = buildRepairClaimsPrompt([{ ...item, issue: 'managed is not stated' }]);
    expect(prompt).toContain('issue: managed is not stated');
    expect(prompt).toContain('{"repairs":[');
  });
});

describe('validators', () => {
  it('accepts well-formed verify and repair replies', () => {
    expect(isClaimVerification({ results: [{ index: 0, supported: true, issue: '' }] })).toBe(true);
    expect(isClaimRepairs({ repairs: [{ index: 0, text: 'I tracked no-shows.' }] })).toBe(true);
  });

  it('rejects malformed replies', () => {
    expect(isClaimVerification({ results: [{ index: '0', supported: true }] })).toBe(false);
    expect(isClaimVerification({ results: [{ index: 0, supported: 'yes' }] })).toBe(false);
    expect(isClaimVerification(null)).toBe(false);
    expect(isClaimRepairs({ repairs: [{ index: 0, text: ' ' }] })).toBe(false);
    expect(isClaimRepairs({})).toBe(false);
  });
});
