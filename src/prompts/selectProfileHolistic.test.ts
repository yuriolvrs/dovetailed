// What this file is: unit tests for the direct-selection prompt and its
// response guard -- confirms the posting and every candidate id/label/text
// reach the prompt, and that the guard accepts/rejects the expected shapes.
// In plain terms: tests proving we ask the AI correctly and only trust
// well-shaped answers.

import { describe, expect, it } from 'vitest';
import {
  buildSelectProfileHolisticPrompt,
  estimateSelectionMaxTokens,
  estimateSelectionPromptTokens,
  isHolisticSelectionResult,
  MAX_ATOM_CHARS,
  MAX_ATOMS,
  MAX_EVIDENCE_CHARS,
  MAX_POSTING_CHARS,
  renderCandidateLines,
} from './selectProfileHolistic';
import { TPM_BUDGET } from './convertLatexTemplate';

/** Worst case this call can ever send: the biggest posting and the biggest evidence block allowed. */
function worstCasePrompt(): string {
  return buildSelectProfileHolisticPrompt({
    postingText: 'x'.repeat(MAX_POSTING_CHARS * 3),
    roleTitle: 'Senior Digital Marketing Associate',
    company: 'A Company With A Fairly Long Name Ltd',
    candidates: Array.from({ length: MAX_ATOMS * 2 }, (_, i) => ({
      id: `experience-${i}aaaaaa`,
      sourceLabel: 'Experience: Some Reasonably Long Job Title, Some Company Name',
      text: 'y'.repeat(MAX_ATOM_CHARS * 2),
    })),
  });
}

describe('buildSelectProfileHolisticPrompt', () => {
  it('embeds the posting text and each candidate id/label/text', () => {
    const prompt = buildSelectProfileHolisticPrompt({
      postingText: 'We need someone to run our community events.',
      roleTitle: 'Community Manager',
      company: 'Acme',
      candidates: [{ id: 'experience-abc', text: 'Organised the campus hackathon', sourceLabel: 'Experience: Lead, Uni' }],
    });

    expect(prompt).toContain('We need someone to run our community events.');
    expect(prompt).toContain('experience-abc');
    expect(prompt).toContain('Experience: Lead, Uni');
    expect(prompt).toContain('"Organised the campus hackathon"');
    expect(prompt).toContain('Community Manager');
    expect(prompt).toContain('Acme');
  });

  it('truncates an overlong posting rather than sending all of it', () => {
    const prompt = buildSelectProfileHolisticPrompt({
      postingText: 'x'.repeat(20000),
      candidates: [{ id: 'skills-1', text: 'Java', sourceLabel: 'Skills' }],
    });

    expect(prompt).toContain('…[truncated]');
    expect(prompt).not.toContain('x'.repeat(MAX_POSTING_CHARS + 1));
  });

  it('renders a placeholder when the profile has no atoms', () => {
    const prompt = buildSelectProfileHolisticPrompt({ postingText: 'A job.', candidates: [] });
    expect(prompt).toContain('(none available)');
  });
});

describe('isHolisticSelectionResult', () => {
  const valid = {
    roleSummary: 'Runs community events.',
    atomIds: ['experience-abc'],
    overallRationale: 'Led with the events work.',
    groupNotes: [{ sourceLabel: 'Experience: Lead, Uni', note: 'Speaks to running events.' }],
  };

  it('accepts a well-formed result', () => {
    expect(isHolisticSelectionResult(valid)).toBe(true);
  });

  it('accepts an empty groupNotes array', () => {
    expect(isHolisticSelectionResult({ ...valid, groupNotes: [] })).toBe(true);
  });

  it('rejects an empty atomIds array -- nothing to build from', () => {
    expect(isHolisticSelectionResult({ ...valid, atomIds: [] })).toBe(false);
  });

  it('rejects non-string atomIds', () => {
    expect(isHolisticSelectionResult({ ...valid, atomIds: [1, 2] })).toBe(false);
  });

  it('rejects a missing roleSummary', () => {
    const { roleSummary: _omitted, ...rest } = valid;
    expect(isHolisticSelectionResult(rest)).toBe(false);
  });

  it('rejects a groupNote missing its note', () => {
    expect(isHolisticSelectionResult({ ...valid, groupNotes: [{ sourceLabel: 'Skills' }] })).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(isHolisticSelectionResult(null)).toBe(false);
    expect(isHolisticSelectionResult('nope')).toBe(false);
  });
});


describe('renderCandidateLines', () => {
  it('bounds the block by characters, not just by count', () => {
    const block = renderCandidateLines(
      Array.from({ length: MAX_ATOMS }, (_, i) => ({
        id: `a${i}`,
        sourceLabel: 'Experience: Engineer, Acme',
        text: 'z'.repeat(MAX_ATOM_CHARS),
      })),
    );

    expect(block.length).toBeLessThanOrEqual(MAX_EVIDENCE_CHARS);
  });

  it('truncates a single runaway atom instead of letting it eat the block', () => {
    const block = renderCandidateLines([
      { id: 'a1', sourceLabel: 'Skills', text: 'q'.repeat(MAX_ATOM_CHARS * 4) },
    ]);

    expect(block).toContain('…[truncated]');
    expect(block.length).toBeLessThan(MAX_ATOM_CHARS * 2);
  });

  it('keeps every atom when the profile is an ordinary size', () => {
    const block = renderCandidateLines([
      { id: 'a1', sourceLabel: 'Skills', text: 'TypeScript' },
      { id: 'a2', sourceLabel: 'Experience: Engineer, Acme', text: 'Organised the campus hackathon' },
    ]);

    expect(block.split('\n')).toHaveLength(2);
    expect(block).toContain('a1');
    expect(block).toContain('a2');
  });
});

describe('token budget', () => {
  // The provider rejects the whole request (413) when prompt + maxTokens
  // exceeds its combined per-minute cap -- so this is the invariant that
  // matters, not any particular number.
  it('keeps prompt + answer budget inside the cap at the worst case it can send', () => {
    const prompt = worstCasePrompt();
    const promptTokens = estimateSelectionPromptTokens(prompt);

    expect(promptTokens + estimateSelectionMaxTokens(prompt)).toBeLessThanOrEqual(TPM_BUDGET);
  });

  it('keeps prompt + answer budget inside the cap for a small posting', () => {
    const prompt = buildSelectProfileHolisticPrompt({
      postingText: 'We need a community manager.',
      candidates: [{ id: 'a1', sourceLabel: 'Skills', text: 'Events' }],
    });

    expect(estimateSelectionPromptTokens(prompt) + estimateSelectionMaxTokens(prompt)).toBeLessThanOrEqual(
      TPM_BUDGET,
    );
  });

  it('still leaves room for reasoning plus a full answer at the worst case', () => {
    // If the floor ever has to engage, the caps above are too loose and the
    // invariant above would be the thing that breaks.
    expect(estimateSelectionMaxTokens(worstCasePrompt())).toBeGreaterThan(2500);
  });

  it('over-counts rather than under-counts a realistic prompt', () => {
    const prompt = buildSelectProfileHolisticPrompt({
      postingText: 'We are hiring a marketing associate to run campaigns and report on performance.',
      candidates: [{ id: 'a1', sourceLabel: 'Skills', text: 'TypeScript' }],
    });

    // Real English runs ~3.5-4 chars/token; the estimate must sit above that.
    expect(estimateSelectionPromptTokens(prompt)).toBeGreaterThan(prompt.length / 4);
  });
});
