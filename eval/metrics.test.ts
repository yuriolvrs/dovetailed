// What this file is: unit tests for the pure evaluation metrics and the neutral text export.
// In plain terms: checks the measuring tape itself, so scores from the eval harness can be trusted.

import { describe, expect, it } from 'vitest';
import type { CoverLetterContent, Profile, ProfileAtom, Requirement, RequirementMatch, ResumeContent } from '../src/types';
import {
  coverageMetrics,
  expectsCareerChange,
  keywordRetention,
  letterMetrics,
  scoreAnswerKey,
  selfNegativeLines,
  wordOverlap,
  type AnswerKey,
} from './metrics';
import { letterToText, resumeToText, stripTestMarker } from './exportText';

const req = (id: string, text: string, kind?: Requirement['kind']): Requirement => ({
  id,
  text,
  severity: 'required',
  order: 0,
  kind,
});
const atom = (id: string, text: string): ProfileAtom => ({ id, source: 'experience', sourceLabel: 'x', text });
const match = (requirementId: string, status: RequirementMatch['status'], atomIds: string[] = []): RequirementMatch => ({
  requirementId,
  status,
  atomIds,
});

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 'p',
  contact: { name: 'Dana (TEST PROFILE - FICTIONAL)', email: 'd@example.com', links: [] },
  skills: [],
  experience: [],
  projects: [],
  education: [],
  writingSamples: [],
  additionalInfo: [],
  ...over,
});

describe('coverageMetrics', () => {
  it('counts statuses in total and by kind, defaulting kind to qualification', () => {
    const reqs = [req('1', 'a', 'duty'), req('2', 'b'), req('3', 'c', 'education')];
    const m = coverageMetrics(reqs, [match('1', 'full', ['x']), match('2', 'gap_unverified'), match('3', 'partial', ['y'])]);
    expect(m).toMatchObject({ total: 3, full: 1, partial: 1, gaps: 1 });
    expect(m.byKind.duty.full).toBe(1);
    expect(m.byKind.qualification.gaps).toBe(1);
    expect(m.byKind.education.partial).toBe(1);
  });
});

describe('scoreAnswerKey', () => {
  const key: AnswerKey = {
    persona: 'T',
    items: [
      { id: 'sched', match: ['scheduling'], coveredBy: ['Book appointments'], mustNotBeCoveredBy: [] },
      { id: 'mac', match: ['mac'], coveredBy: [], mustNotBeCoveredBy: ['no Mac'] },
      { id: 'comm', match: ['communication'], coveredBy: [], mustNotBeCoveredBy: ['Spanish'] },
      { id: 'missing', match: ['quickbooks'], coveredBy: [], mustNotBeCoveredBy: [] },
    ],
  };
  const atoms = [
    atom('a1', 'Book appointments for providers'),
    atom('a2', 'Windows (no Mac experiance)'),
    atom('a3', 'Spanish (conversational)'),
  ];

  it('finds true covers, false gaps, false covers and honest gaps', () => {
    const reqs = [req('r1', 'Scheduling of appointments'), req('r2', 'Mac systems'), req('r3', 'Written communication')];
    const bad = scoreAnswerKey(
      key,
      reqs,
      [match('r1', 'gap_unverified'), match('r2', 'full', ['a2']), match('r3', 'full', ['a3'])],
      atoms,
    );
    expect(bad.falseGaps).toBe(1);
    expect(bad.falseCovers).toBe(2);
    expect(bad.notExtracted).toBe(1);

    const ok = scoreAnswerKey(
      key,
      reqs,
      [match('r1', 'full', ['a1']), match('r2', 'gap_no_candidates'), match('r3', 'gap_unverified')],
      atoms,
    );
    expect(ok.trueCovers).toBe(1);
    expect(ok.honestGaps).toBe(2);
    expect(ok.falseGaps + ok.falseCovers).toBe(0);
  });

  it('does not call it a false cover when a good line is also cited', () => {
    const k: AnswerKey = {
      persona: 'T',
      items: [{ id: 'x', match: ['mac'], coveredBy: ['Excel'], mustNotBeCoveredBy: ['no Mac'] }],
    };
    const r = scoreAnswerKey(k, [req('r', 'Mac and Excel')], [match('r', 'full', ['a2', 'a4'])], [
      ...atoms,
      atom('a4', 'Excel (advanced)'),
    ]);
    expect(r.trueCovers).toBe(1);
    expect(r.falseCovers).toBe(0);
  });

  it('reports an unexpected cover when the key expects a gap and the line is not on the must-not list', () => {
    const k: AnswerKey = {
      persona: 'T',
      items: [{ id: 'x', match: ['tickets'], coveredBy: [], mustNotBeCoveredBy: [] }],
    };
    const r = scoreAnswerKey(k, [req('r', 'Job tickets')], [match('r', 'partial', ['a1'])], atoms);
    expect(r.unexpectedCovers).toBe(1);
  });
});

describe('keywordRetention', () => {
  it('lists keywords lost and gained against the base text', () => {
    const r = keywordRetention(['excel', 'epic', 'phone'], 'Excel and Epic', 'Epic and phone');
    expect(r.inBase).toEqual(['excel', 'epic']);
    expect(r.inResume).toEqual(['epic', 'phone']);
    expect(r.lost).toEqual(['excel']);
    expect(r.gained).toEqual(['phone']);
  });
});

describe('selfNegativeLines', () => {
  it('finds printed self-negative lines', () => {
    const content: ResumeContent = {
      contact: { name: 'x', email: 'e', links: [] },
      skills: [{ category: 'Tools', items: ['Windows (no Mac experiance)', 'Excel'] }],
      experience: [],
      projects: [],
      education: [],
    };
    expect(selfNegativeLines(content)).toEqual(['Windows (no Mac experiance)']);
  });
});

describe('wordOverlap', () => {
  it('is high for near-duplicates and low for different sentences', () => {
    expect(
      wordOverlap('I took product photos in Photoshop', 'I took product photos in Photoshop for the store'),
    ).toBeGreaterThanOrEqual(0.6);
    expect(wordOverlap('I scheduled infusion chairs', 'Customer service in a busy cafe')).toBeLessThan(0.3);
  });
});

describe('letterMetrics', () => {
  const content: CoverLetterContent = {
    greeting: 'Dear Hiring Manager,',
    paragraphs: ['I am excited to apply for this role. My profile shows I thrive in teams.‑ Ok.'],
    closing: 'Sincerely,',
  };
  const sourceMap = [
    { generatedText: 'I took product photos in Photoshop', atomIds: ['a'], claim: true },
    { generatedText: 'I took product photos in Photoshop for the store', atomIds: ['a'], claim: true, supported: false },
    { generatedText: 'I built a rocket', atomIds: [], claim: true },
    { generatedText: 'I like the company', atomIds: [], claim: false },
  ];

  it('flags sentences, duplicates, banned phrases and odd hyphens', () => {
    const m = letterMetrics(content, sourceMap, profile());
    expect(m.flaggedSentences.map((f) => f.reason)).toEqual(['unsupported', 'no_evidence']);
    expect(m.duplicateSentences).toHaveLength(1);
    expect(m.bannedPhrases.map((b) => b.label).sort()).toEqual(['buzzword', 'profile', 'stock opener']);
    expect(m.nonAsciiHyphens).toEqual([{ char: '‑', codePoint: 'U+2011', count: 1 }]);
    expect(m.wordCount).toBeGreaterThan(10);
  });

  it('expects a career change from a summary or a career break, and detects naming it', () => {
    expect(expectsCareerChange(profile())).toBe(false);
    expect(expectsCareerChange(profile({ summary: 'Nurse moving into operations.' }))).toBe(true);
    expect(
      expectsCareerChange(
        profile({ experience: [{ company: 'Career Break', title: 'Career Break', current: false, bullets: [] }] }),
      ),
    ).toBe(true);
    const named = letterMetrics(
      { ...content, paragraphs: ['I am moving into operations after caregiving.'] },
      [],
      profile({ summary: 's' }),
    );
    expect(named.careerChange).toEqual({ heuristic: true, expected: true, named: true });
    const quiet = letterMetrics({ ...content, paragraphs: ['I like scheduling.'] }, [], profile({ summary: 's' }));
    expect(quiet.careerChange.named).toBe(false);
  });
});

describe('export text', () => {
  it('strips the test marker and prints a neutral layout', () => {
    expect(stripTestMarker('DANA WHITFIELD (TEST PROFILE - FICTIONAL)')).toBe('DANA WHITFIELD');
    const resume: ResumeContent = {
      contact: { name: 'Dana (TEST PROFILE - FICTIONAL)', email: 'd@example.com', location: 'Portland, OR', links: [] },
      summary: 'A nurse.',
      skills: [{ category: 'Tools', items: ['Epic', 'Excel'] }],
      experience: [
        { company: 'Riverbend', title: 'RN', startMonth: 'Mar', startYear: '2019', current: true, bullets: ['Trained new nurses'] },
      ],
      projects: [],
      education: [{ school: 'OCU', degree: 'BSN', current: false, endYear: '2016' }],
    };
    const text = resumeToText(resume);
    expect(text).not.toContain('TEST PROFILE');
    expect(text.indexOf('EXPERIENCE')).toBeLessThan(text.indexOf('EDUCATION'));
    expect(text).toContain('- Trained new nurses');
    expect(text).toContain('Mar 2019 - Present');
    const letter = letterToText({ greeting: 'Dear X,', paragraphs: ['One.', 'Two.'], closing: 'Sincerely,' }, resume.contact.name);
    expect(letter.trim().endsWith('Dana')).toBe(true);
  });
});
