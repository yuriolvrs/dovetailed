// What this file is: pure scoring functions for the evaluation harness. They turn one generation
// (requirements, matches, resume, letter) into numbers: coverage, answer-key hits, keyword
// retention, self-negative lines, and letter quality checks. No network, no file access.
// In plain terms: the measuring tape. It looks at what the app produced and counts what went
// right and wrong.

import type {
  CoverLetterContent,
  Profile,
  ProfileAtom,
  Requirement,
  RequirementKind,
  RequirementMatch,
  ResumeContent,
  SourceMapEntry,
} from '../src/types';
import { isSelfNegative } from '../src/lib/generation/selectResumeContent';

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export interface CoverageCounts {
  total: number;
  full: number;
  partial: number;
  gaps: number;
}

export interface CoverageMetrics extends CoverageCounts {
  byKind: Record<RequirementKind, CoverageCounts>;
}

const KINDS: RequirementKind[] = ['qualification', 'duty', 'education'];

function emptyCounts(): CoverageCounts {
  return { total: 0, full: 0, partial: 0, gaps: 0 };
}

/**
 * Counts requirements by match status, in total and by kind (a missing kind counts as
 * "qualification", like the app does).
 * In plain terms: how many requirements were found, and how many the profile covers.
 */
export function coverageMetrics(requirements: Requirement[], matches: RequirementMatch[]): CoverageMetrics {
  const statusOf = new Map(matches.map((m) => [m.requirementId, m.status]));
  const result: CoverageMetrics = {
    ...emptyCounts(),
    byKind: { qualification: emptyCounts(), duty: emptyCounts(), education: emptyCounts() },
  };
  for (const r of requirements) {
    const status = statusOf.get(r.id);
    const kind = KINDS.includes(r.kind as RequirementKind) ? (r.kind as RequirementKind) : 'qualification';
    for (const bucket of [result, result.byKind[kind]]) {
      bucket.total += 1;
      if (status === 'full') bucket.full += 1;
      else if (status === 'partial') bucket.partial += 1;
      else bucket.gaps += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Answer key
// ---------------------------------------------------------------------------

export interface KeyItem {
  id: string;
  /** Lowercase substrings; a requirement whose text contains any of them belongs to this item. */
  match: string[];
  /** Substrings of profile lines that genuinely cover the item. Empty: the profile has no honest evidence. */
  coveredBy: string[];
  /** Substrings of profile lines that must NOT be the reason the item counts as covered. */
  mustNotBeCoveredBy: string[];
}

export interface AnswerKey {
  persona: string;
  note?: string;
  items: KeyItem[];
}

export type KeyVerdict =
  | 'true_cover'
  | 'false_gap'
  | 'honest_gap'
  | 'false_cover'
  | 'unexpected_cover'
  | 'other_cover';

export interface KeyRequirementResult {
  requirement: string;
  status: string;
  cited: string[];
  verdict: KeyVerdict;
}

export interface KeyItemResult {
  id: string;
  /** True when no extracted requirement matched the item's keywords. */
  notExtracted: boolean;
  requirements: KeyRequirementResult[];
}

export interface KeyMetrics {
  trueCovers: number;
  falseGaps: number;
  falseCovers: number;
  honestGaps: number;
  unexpectedCovers: number;
  otherCovers: number;
  notExtracted: number;
  items: KeyItemResult[];
}

function includesAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

function verdictFor(item: KeyItem, status: string, cited: string[]): KeyVerdict {
  const covered = status === 'full' || status === 'partial';
  if (!covered) return item.coveredBy.length > 0 ? 'false_gap' : 'honest_gap';
  const good = cited.some((t) => includesAny(t, item.coveredBy));
  const bad = cited.some((t) => includesAny(t, item.mustNotBeCoveredBy));
  if (bad && !good) return 'false_cover';
  if (good) return 'true_cover';
  return item.coveredBy.length === 0 ? 'unexpected_cover' : 'other_cover';
}

/**
 * Scores matching results against a hand-written answer key. Each requirement that belongs to
 * a key item gets one verdict. A "false gap" is a gap where the key names a covering line.
 * A "false cover" is a cover whose only cited lines are on the item's must-not list.
 * In plain terms: checks the app's matching against the answers we wrote down by hand.
 */
export function scoreAnswerKey(
  key: AnswerKey,
  requirements: Requirement[],
  matches: RequirementMatch[],
  atoms: ProfileAtom[],
): KeyMetrics {
  const matchOf = new Map(matches.map((m) => [m.requirementId, m]));
  const textOf = new Map(atoms.map((a) => [a.id, a.text]));
  const out: KeyMetrics = {
    trueCovers: 0,
    falseGaps: 0,
    falseCovers: 0,
    honestGaps: 0,
    unexpectedCovers: 0,
    otherCovers: 0,
    notExtracted: 0,
    items: [],
  };

  for (const item of key.items) {
    const belonging = requirements.filter((r) => includesAny(r.text, item.match));
    const results: KeyRequirementResult[] = belonging.map((r) => {
      const m = matchOf.get(r.id);
      const status = m?.status ?? 'gap_no_candidates';
      const cited = (m?.atomIds ?? []).map((id) => textOf.get(id) ?? id);
      return { requirement: r.text, status, cited, verdict: verdictFor(item, status, cited) };
    });
    if (results.length === 0) out.notExtracted += 1;
    for (const r of results) {
      if (r.verdict === 'true_cover') out.trueCovers += 1;
      else if (r.verdict === 'false_gap') out.falseGaps += 1;
      else if (r.verdict === 'false_cover') out.falseCovers += 1;
      else if (r.verdict === 'honest_gap') out.honestGaps += 1;
      else if (r.verdict === 'unexpected_cover') out.unexpectedCovers += 1;
      else out.otherCovers += 1;
    }
    out.items.push({ id: item.id, notExtracted: results.length === 0, requirements: results });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Keyword retention
// ---------------------------------------------------------------------------

export interface KeywordRetention {
  total: number;
  inBase: string[];
  inResume: string[];
  /** In the base resume but missing from the selected one. */
  lost: string[];
  /** Missing from the base but present in the selected one (rare). */
  gained: string[];
}

/**
 * Compares which posting keywords (lowercase substrings) appear in the base resume text and
 * in the selected resume text.
 * In plain terms: did tailoring keep the words the posting cares about?
 */
export function keywordRetention(keywords: string[], baseText: string, resumeText: string): KeywordRetention {
  const base = baseText.toLowerCase();
  const resume = resumeText.toLowerCase();
  const inBase = keywords.filter((k) => base.includes(k.toLowerCase()));
  const inResume = keywords.filter((k) => resume.includes(k.toLowerCase()));
  return {
    total: keywords.length,
    inBase,
    inResume,
    lost: inBase.filter((k) => !inResume.includes(k)),
    gained: inResume.filter((k) => !inBase.includes(k)),
  };
}

// ---------------------------------------------------------------------------
// Resume checks
// ---------------------------------------------------------------------------

/**
 * Lists every printed resume line (bullet, skill item, summary) that undercuts the candidate,
 * using the app's own isSelfNegative.
 * In plain terms: finds lines like "no Mac experience" that slipped onto the resume.
 */
export function selfNegativeLines(content: ResumeContent): string[] {
  const lines = [
    content.summary ?? '',
    ...content.skills.flatMap((g) => g.items),
    ...content.experience.flatMap((e) => e.bullets),
    ...content.projects.flatMap((p) => [p.description, ...p.bullets]),
    ...content.education.flatMap((e) => e.details ?? []),
  ];
  return lines.filter((l) => l.trim() !== '' && isSelfNegative(l));
}

// ---------------------------------------------------------------------------
// Letter checks
// ---------------------------------------------------------------------------

// Stock openers/closers, buzzwords. Lowercase regexes; edit here to tighten the bar.
export const BANNED_PHRASES: { label: string; pattern: RegExp }[] = [
  { label: 'stock opener', pattern: /\bi am (?:excited|thrilled|delighted|eager) to (?:apply|submit)\b|\bi am writing to (?:apply|express)\b/i },
  { label: 'stock closer', pattern: /\bi look forward to (?:the opportunity|hearing)\b|\bthank you for (?:your time and consideration|considering)\b/i },
  { label: 'buzzword', pattern: /\b(?:thrive[sd]?|passionate|dynamic|synerg\w*|results-driven|proven track record|position me well|leverag\w+|fast-paced)\b/i },
  { label: 'profile', pattern: /\bprofile\b/i },
];

/** Hyphen-like characters that are not the plain ASCII "-". */
const NON_ASCII_HYPHEN = /[‐-―−]/g;

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/**
 * Word overlap between two sentences: shared distinct words divided by the smaller sentence's
 * distinct word count. Words of one or two letters are ignored.
 * In plain terms: how much one sentence repeats another.
 */
export function wordOverlap(a: string, b: string): number {
  const setA = new Set(words(a).filter((w) => w.length > 2));
  const setB = new Set(words(b).filter((w) => w.length > 2));
  const smaller = Math.min(setA.size, setB.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared += 1;
  return shared / smaller;
}

// Heuristic only: wording that suggests the letter names a career change or a gap.
const CHANGE_WORDS =
  /\b(?:transition\w*|career change|changing careers?|move into|moving into|moves? into|shift(?:ing)? (?:from|into|to)|pivot\w*|return(?:ing)? to work|career break|gap|stepp?(?:ed|ing)? away|time away|caregiv\w*)\b/i;
const BREAK_WORDS = /\b(?:career break|gap|sabbatical|leave of absence|caregiv\w*)\b/i;

export interface LetterMetrics {
  wordCount: number;
  sentenceCount: number;
  /** Sentences with supported === false, or a claim with no atomIds. */
  flaggedSentences: { text: string; reason: 'unsupported' | 'no_evidence' }[];
  duplicateSentences: { a: string; b: string; overlap: number }[];
  bannedPhrases: { label: string; match: string }[];
  nonAsciiHyphens: { char: string; codePoint: string; count: number }[];
  /** Heuristic: keyword guess, not a judgment. */
  careerChange: { heuristic: true; expected: boolean; named: boolean };
}

/**
 * Whether the profile gives the letter something to say about a change or a gap: a summary
 * line, or a "career break" style experience entry. Keyword heuristic.
 */
export function expectsCareerChange(profile: Profile): boolean {
  if ((profile.summary ?? '').trim() !== '') return true;
  return profile.experience.some((e) => BREAK_WORDS.test(`${e.title} ${e.company}`));
}

/**
 * Runs all letter checks. Word count covers greeting, paragraphs and closing; sentence checks
 * use the sourceMap (one entry per sentence).
 * In plain terms: reads the cover letter and counts its problems.
 */
export function letterMetrics(content: CoverLetterContent, sourceMap: SourceMapEntry[], profile: Profile): LetterMetrics {
  const fullText = [content.greeting, ...content.paragraphs, content.closing].join('\n');

  const flagged: LetterMetrics['flaggedSentences'] = [];
  for (const e of sourceMap) {
    if (e.supported === false) flagged.push({ text: e.generatedText, reason: 'unsupported' });
    else if (e.claim !== false && e.atomIds.length === 0) flagged.push({ text: e.generatedText, reason: 'no_evidence' });
  }

  const duplicates: LetterMetrics['duplicateSentences'] = [];
  for (let i = 0; i < sourceMap.length; i++) {
    for (let j = i + 1; j < sourceMap.length; j++) {
      const overlap = wordOverlap(sourceMap[i].generatedText, sourceMap[j].generatedText);
      if (overlap >= 0.6) duplicates.push({ a: sourceMap[i].generatedText, b: sourceMap[j].generatedText, overlap: Math.round(overlap * 100) / 100 });
    }
  }

  const banned: LetterMetrics['bannedPhrases'] = [];
  for (const { label, pattern } of BANNED_PHRASES) {
    const found = fullText.match(new RegExp(pattern.source, 'gi'));
    for (const match of found ?? []) banned.push({ label, match });
  }

  const hyphenCounts = new Map<string, number>();
  for (const ch of fullText.match(NON_ASCII_HYPHEN) ?? []) hyphenCounts.set(ch, (hyphenCounts.get(ch) ?? 0) + 1);

  return {
    wordCount: words(fullText).length,
    sentenceCount: sourceMap.length,
    flaggedSentences: flagged,
    duplicateSentences: duplicates,
    bannedPhrases: banned,
    nonAsciiHyphens: [...hyphenCounts].map(([char, count]) => ({
      char,
      codePoint: 'U+' + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0'),
      count,
    })),
    careerChange: { heuristic: true, expected: expectsCareerChange(profile), named: CHANGE_WORDS.test(fullText) },
  };
}
