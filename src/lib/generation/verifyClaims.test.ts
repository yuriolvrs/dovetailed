// What this file is: unit tests for the claim check flow (verify, repair, re-verify). The LLM is mocked.
// In plain terms: tests proving unsupported sentences are caught, fixed only when the fix passes, and
// that a broken check never blocks the letter.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dropUnsupportedRewords, verifyClaimSentences } from './verifyClaims';

const { generateStructuredMock } = vi.hoisted(() => ({ generateStructuredMock: vi.fn() }));
vi.mock('../llm', () => ({ generateStructured: generateStructuredMock }));

const items = [
  { index: 0, sentence: 'I tracked no-shows.', evidence: ['Made a spreadsheet to track no-shows'] },
  { index: 1, sentence: 'I reduced no-shows.', evidence: ['Made a spreadsheet to track no-shows'] },
];

const verdicts = (...v: [number, boolean][]) => ({
  results: v.map(([index, supported]) => ({ index, supported, issue: supported ? '' : 'adds a result' })),
});

describe('verifyClaimSentences', () => {
  beforeEach(() => generateStructuredMock.mockReset());

  it('marks supported sentences and leaves text alone when all pass (one call)', async () => {
    generateStructuredMock.mockResolvedValueOnce(verdicts([0, true], [1, true]));
    const out = await verifyClaimSentences(items);
    expect(out.map((o) => [o.text, o.supported])).toEqual([
      ['I tracked no-shows.', true],
      ['I reduced no-shows.', true],
    ]);
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    expect(generateStructuredMock.mock.calls[0][2].temperature).toBe(0);
  });

  it('repairs a failed sentence and keeps the repair when it re-verifies', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(verdicts([0, true], [1, false]))
      // Each call numbers its items by position, so the one failed item is 0.
      .mockResolvedValueOnce({ repairs: [{ index: 0, text: 'I tracked no-shows in a spreadsheet.' }] })
      .mockResolvedValueOnce(verdicts([0, true]));
    const out = await verifyClaimSentences(items);
    expect(out[1]).toMatchObject({ text: 'I tracked no-shows in a spreadsheet.', supported: true });
    expect(generateStructuredMock).toHaveBeenCalledTimes(3);
  });

  it('maps answers back by position when the caller indexes do not start at 0', async () => {
    const sparse = [
      { index: 5, sentence: 'I wrote copy that grew sales.', evidence: ['Wrote some product descriptions'] },
      { index: 9, sentence: 'I used Canva.', evidence: ['Made Canva graphics'] },
    ];
    generateStructuredMock
      .mockResolvedValueOnce(verdicts([0, false], [1, true]))
      .mockResolvedValueOnce({ repairs: [{ index: 0, text: 'I wrote some product descriptions.' }] })
      .mockResolvedValueOnce(verdicts([0, true]));
    const out = await verifyClaimSentences(sparse);
    expect(out).toEqual([
      { index: 5, text: 'I wrote some product descriptions.', supported: true },
      { index: 9, text: 'I used Canva.', supported: true },
    ]);
    expect(generateStructuredMock.mock.calls[0][0]).toContain('[1] sentence: "I used Canva."');
  });

  it('keeps the original and marks it unsupported when the repair still fails', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(verdicts([0, true], [1, false]))
      .mockResolvedValueOnce({ repairs: [{ index: 1, text: 'I cut no-shows by half.' }] })
      .mockResolvedValueOnce(verdicts([1, false]));
    const out = await verifyClaimSentences(items);
    expect(out[1]).toMatchObject({ text: 'I reduced no-shows.', supported: false });
  });

  it('does not repair when repair is disabled', async () => {
    generateStructuredMock.mockResolvedValueOnce(verdicts([0, true], [1, false]));
    const out = await verifyClaimSentences(items, { repair: false });
    expect(out[1]).toMatchObject({ text: 'I reduced no-shows.', supported: false });
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
  });

  it('leaves supported undefined when the verify call fails', async () => {
    generateStructuredMock.mockRejectedValueOnce(new Error('network'));
    const out = await verifyClaimSentences(items);
    expect(out.map((o) => [o.text, o.supported])).toEqual([
      ['I tracked no-shows.', undefined],
      ['I reduced no-shows.', undefined],
    ]);
  });

  it('keeps the unsupported mark when the repair call fails', async () => {
    generateStructuredMock
      .mockResolvedValueOnce(verdicts([0, true], [1, false]))
      .mockRejectedValueOnce(new Error('boom'));
    const out = await verifyClaimSentences(items);
    expect(out[1]).toMatchObject({ text: 'I reduced no-shows.', supported: false });
  });

  it('makes no call for an empty list', async () => {
    expect(await verifyClaimSentences([])).toEqual([]);
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });
  it('rethrows when the build was stopped, instead of skipping the check', async () => {
    const controller = new AbortController();
    controller.abort();
    generateStructuredMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    await expect(verifyClaimSentences(items, { signal: controller.signal })).rejects.toThrow('Aborted');
  });
});

describe('dropUnsupportedRewords', () => {
  beforeEach(() => generateStructuredMock.mockReset());
  const original = 'Assisted with billing issues';

  it('drops failed suggestions, uses the original as the only evidence, and never repairs', async () => {
    generateStructuredMock.mockResolvedValueOnce(verdicts([0, true], [1, false]));
    const out = await dropUnsupportedRewords(original, ['Helped with billing issues', 'Led billing issues']);
    expect(out).toEqual(['Helped with billing issues']);
    expect(generateStructuredMock).toHaveBeenCalledTimes(1);
    expect(generateStructuredMock.mock.calls[0][0]).toContain(original);
  });

  it('keeps every suggestion when the check cannot run', async () => {
    generateStructuredMock.mockRejectedValueOnce(new Error('down'));
    const list = ['A', 'B'];
    expect(await dropUnsupportedRewords(original, list)).toEqual(list);
  });

  it('makes no call for an empty list', async () => {
    expect(await dropUnsupportedRewords(original, [])).toEqual([]);
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });
});
