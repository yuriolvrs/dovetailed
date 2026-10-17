// What this file is: pure, deterministic checks on generated cover letter sentences. It finds a
// sentence that names the wrong employer, finds near-duplicate sentences, and removes meta phrases
// about the profile and stock openers or closers.
// In plain terms: simple code rules (no AI) that catch the letter mistakes the AI keeps making.

import type { Profile } from '../../types';

const MIN_NAME_CHARS = 4;
const DUPLICATE_OVERLAP = 0.6;
const MIN_WORDS_FOR_OVERLAP = 3;

const STOPWORDS = new Set(
  'a an the and or but of to in on at for with by from as is was were are be been being i me my we our us you your it its this that these those which who whom their they them he she his her have has had do did not so than then also very'.split(
    ' ',
  ),
);

const COMPANY_SUFFIX = /[\s,.]+(inc|llc|ltd|co|corp|corporation|company)\.?$/i;

/** The part of an organisation name worth matching: no leading "the", no "Inc."-style ending. */
function distinctivePart(name: string): string {
  return name.trim().replace(COMPANY_SUFFIX, '').replace(/^the\s+/i, '').trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `name` appears in `text` as a whole word or phrase, ignoring case. */
function mentions(text: string, name: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/**
 * Looks for an employer, project or school named in the sentence that none of its cited atoms
 * belong to. Names come from the profile's experience companies, project names and schools. Names
 * shorter than 4 characters are ignored, and so is the company applied to (targetCompany). Returns the first wrong name, or undefined.
 * In plain terms: spots a sentence that says one job but cites evidence from a different one.
 */
export function findWrongEmployer(
  sentence: string,
  citedLabels: string[],
  profile: Pick<Profile, 'experience' | 'projects' | 'education'>,
  targetCompany?: string,
): string | undefined {
  const target = targetCompany ? distinctivePart(targetCompany).toLowerCase() : '';
  const names = [
    ...profile.experience.map((e) => e.company),
    ...profile.projects.map((p) => p.name),
    ...profile.education.map((e) => e.school),
  ]
    .map(distinctivePart)
    .filter((n) => n.length >= MIN_NAME_CHARS)
    // The company being applied to may be named freely, even if the candidate worked there.
    .filter((n) => n.toLowerCase() !== target);
  const labels = citedLabels.map((l) => l.toLowerCase());
  for (const name of names) {
    if (!mentions(sentence, name)) continue;
    if (!labels.some((l) => l.includes(name.toLowerCase()))) return name;
  }
  return undefined;
}

/** The sentence's lowercase content words (stopwords removed) as a set. */
function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Returns the positions of sentences that repeat an earlier kept sentence. Two sentences repeat
 * when their content words overlap by 0.6 or more (Jaccard). A sentence with fewer than 3 content
 * words repeats only when its word set is identical.
 * In plain terms: finds the later copy when the letter says the same thing twice.
 */
export function findDuplicateSentences(sentences: string[]): Set<number> {
  const duplicates = new Set<number>();
  const kept: Set<string>[] = [];
  sentences.forEach((sentence, i) => {
    const words = contentWords(sentence);
    const repeated = kept.some((earlier) => {
      if (words.size === 0 || earlier.size === 0) return false;
      if (words.size < MIN_WORDS_FOR_OVERLAP || earlier.size < MIN_WORDS_FOR_OVERLAP) {
        return words.size === earlier.size && [...words].every((w) => earlier.has(w));
      }
      return jaccard(words, earlier) >= DUPLICATE_OVERLAP;
    });
    if (repeated) duplicates.add(i);
    else kept.push(words);
  });
  return duplicates;
}

const PROFILE_SOURCE = String.raw`(?:profile|resume|cv)`;
// "as stated in my profile", "as listed on my resume", "according to my resume".
const META_CLAUSE = new RegExp(
  String.raw`(?:\bas\s+(?:stated|listed|shown|noted|described|mentioned|detailed|outlined)\s+(?:in|on)\s+my\s+${PROFILE_SOURCE}|\baccording\s+to\s+my\s+${PROFILE_SOURCE})`,
  'i',
);
const META_STILL_PRESENT = /\b(?:my|the)\s+profile\b/i;

// Stock openers (at the start of a sentence) and closers (from the phrase to the end).
const STOCK_OPENER =
  /^I\s+(?:am|'m)\s+(?:very\s+|truly\s+|really\s+)?(?:excited|thrilled|delighted|eager|pleased)\s+to\s+apply(?:\s+for\s+[^,;.!?]*)?[,;:]?\s*|^I\s+am\s+writing\s+to\s+(?:express\s+my\s+interest|apply)(?:\s+(?:in|for)\s+[^,;.!?]*)?[,;:]?\s*/i;
const STOCK_CLOSER =
  /[,;]?\s*\bI\s+look\s+forward\s+to\s+discussing\s+how\s+my\s+[^.!?]*/i;

function startsSentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function wordCount(text: string): number {
  return (text.match(/[A-Za-z0-9]+/g) ?? []).length;
}

/**
 * Removes meta phrases about the profile ("as stated in my profile", "according to my resume") and
 * stock openers or closers from one sentence. It deletes the clause. If the rest is too short to
 * stand as a sentence, or a mention of "my profile" is left, it returns null (drop the sentence).
 * In plain terms: cleans out phrases like "as listed on my resume", or drops the sentence if it cannot.
 */
export function cleanMetaPhrases(sentence: string): string | null {
  let text = sentence.trim();

  // Clause with a comma on either side, or at the start / end of the sentence.
  const clause = text.match(META_CLAUSE);
  if (clause) {
    const at = clause.index ?? 0;
    const before = text.slice(0, at).replace(/[\s,;:]+$/, '');
    const after = text.slice(at + clause[0].length).replace(/^[\s,;:]+/, '');
    const joined = before === '' ? startsSentence(after) : after === '' ? before : `${before} ${after}`;
    // Keep the end punctuation when the clause was last.
    const endMark = /[.!?]$/.test(text) && !/[.!?]$/.test(joined) ? text.slice(-1) : '';
    text = `${joined}${endMark}`.replace(/\s+([,.;!?])/g, '$1');
  }

  const opener = text.match(STOCK_OPENER);
  if (opener) text = startsSentence(text.slice(opener[0].length).replace(/^and\s+/i, '').trim());

  const closer = text.match(STOCK_CLOSER);
  if (closer) {
    const kept = text.slice(0, closer.index ?? 0).trim();
    text = kept === '' ? '' : /[.!?]$/.test(kept) ? kept : `${kept}.`;
  }

  if (META_STILL_PRESENT.test(text)) return null;
  // A sentence we did not change stays as written; a cut-down stub is not a sentence.
  if (text !== sentence.trim() && wordCount(text) < 3) return null;
  return text;
}
