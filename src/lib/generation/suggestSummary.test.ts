// What this file is: unit tests for the summary suggestion request, with the
// model mocked. Covers the claim-check filter and the check-could-not-run case.
// In plain terms: proves unsupported summary drafts are thrown away and that
// nothing is lost when the fact check fails to run.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isSummarySuggestions } from '../../prompts/suggestSummary';

const { generateStructuredMock } = vi.hoisted(() => ({ generateStructuredMock: vi.fn() }));
vi.mock('../llm', () => ({ generateStructured: generateStructuredMock }));

import { requestSummarySuggestions } from './suggestSummary';

const LINES = ['Managed a 12-bed ward', 'Trained new nurses'];

describe('requestSummarySuggestions', () => {
  beforeEach(() => generateStructuredMock.mockReset());

  it('drops a draft the claim check marks unsupported, with no repair call', async () => {
    generateStructuredMock
      .mockResolvedValueOnce({ suggestions: ['Nurse who trained new staff.', 'Nurse with 10 years of ICU leadership.'] })
      .mockResolvedValueOnce({
        results: [
          { index: 0, supported: true, issue: '' },
          { index: 1, supported: false, issue: 'invents years' },
        ],
      });
    const out = await requestSummarySuggestions('Ward nurse', LINES);
    expect(out).toEqual(['Nurse who trained new staff.']);
    expect(generateStructuredMock).toHaveBeenCalledTimes(2);
    expect(generateStructuredMock.mock.calls[1][0]).toContain('Managed a 12-bed ward');
  });

  it('keeps the drafts when the check could not run', async () => {
    generateStructuredMock
      .mockResolvedValueOnce({ suggestions: ['Nurse who trained new staff.'] })
      .mockRejectedValueOnce(new Error('network'));
    expect(await requestSummarySuggestions('Ward nurse', LINES)).toEqual(['Nurse who trained new staff.']);
  });

  it('makes no call when there are no evidence lines', async () => {
    expect(await requestSummarySuggestions('Ward nurse', [])).toEqual([]);
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });
});

describe('isSummarySuggestions', () => {
  it('accepts up to two non-empty strings', () => {
    expect(isSummarySuggestions({ suggestions: [] })).toBe(true);
    expect(isSummarySuggestions({ suggestions: ['a', 'b'] })).toBe(true);
    expect(isSummarySuggestions({ suggestions: ['a', 'b', 'c'] })).toBe(false);
    expect(isSummarySuggestions({ suggestions: [' '] })).toBe(false);
    expect(isSummarySuggestions(null)).toBe(false);
  });
});
