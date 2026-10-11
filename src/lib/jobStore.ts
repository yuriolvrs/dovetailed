// What this file is: small helper functions for creating, loading, saving,
// listing, and deleting job postings in Dexie's `jobPostings` table. Mirrors
// the shape of profileStore.ts, but for a multi-record table instead of a
// single fixed-id row.
// In plain terms: the code that reads and saves your saved job postings (and
// their analyses) to your browser's storage.

import { db } from './db';
import type { ApplicationStatus, JobPosting } from '../types';

const LABEL_MAX_CHARS = 80;

/**
 * Work arrangement options offered in the Jobs page's Arrangement dropdown.
 * In plain terms: the Onsite/Hybrid/Remote choices you can pick for a job.
 */
export const ARRANGEMENTS = ['Onsite', 'Hybrid', 'Remote'] as const;

/**
 * Application-tracker status options, in the order they're offered in the
 * Status dropdown -- roughly the order an application progresses through
 * (though a candidate can jump straight to 'rejected' from any stage).
 * In plain terms: the Applied/Interviewing/Rejected/Offer choices you can
 * pick for a job's status.
 */
export const STATUSES: readonly ApplicationStatus[] = ['applied', 'interviewing', 'offer', 'rejected'];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
};

/**
 * Badge palette for each status, shared by the Jobs list's status badge and
 * the detail page's status picker so one status never reads as two different
 * colors depending on which screen you're looking at.
 * In plain terms: which color each application status is shown in.
 */
export const STATUS_COLORS: Record<ApplicationStatus, 'blue' | 'amber' | 'green' | 'red'> = {
  applied: 'blue',
  interviewing: 'amber',
  offer: 'green',
  rejected: 'red',
};

/**
 * Turns a deadline timestamp into a short "time left" label plus a badge
 * color that escalates as it approaches -- slate with time to spare, amber
 * inside 3 days, red once it's today or past.
 * In plain terms: the "5d left" / "Overdue by 2d" chip shown next to a
 * posting's deadline.
 */
export function deadlineCountdown(deadline: number): { label: string; color: 'red' | 'amber' | 'slate' } {
  const days = Math.ceil((deadline - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, color: 'red' };
  if (days === 0) return { label: 'Due today', color: 'red' };
  if (days <= 3) return { label: `${days}d left`, color: 'amber' };
  return { label: `${days}d left`, color: 'slate' };
}

/**
 * Builds a new, unsaved posting from pasted text. Caller must saveJobPosting it.
 * In plain terms: turns pasted job text into a draft posting, ready to save.
 */
export function newJobPosting(
  rawText: string,
  details?: { title?: string; company?: string; location?: string; arrangement?: string },
): JobPosting {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    title: details?.title,
    company: details?.company,
    location: details?.location,
    arrangement: details?.arrangement,
    rawText,
  };
}

/**
 * All saved postings, newest first.
 * In plain terms: every job you've saved, most recent on top.
 */
export async function listJobPostings(): Promise<JobPosting[]> {
  return db.jobPostings.orderBy('createdAt').reverse().toArray();
}

export async function loadJobPosting(id: string): Promise<JobPosting | undefined> {
  return db.jobPostings.get(id);
}

export async function saveJobPosting(posting: JobPosting): Promise<void> {
  await db.jobPostings.put(posting);
}

export async function deleteJobPosting(id: string): Promise<void> {
  await db.jobPostings.delete(id);
}

const COMPANY_LINE = /^(?:at|company|employer)\s*[:\s]\s*(.+)$/i;
const GUESS_SCAN_LINES = 15;
// A real company name is a handful of words at most -- this rejects
// sentence-like continuations of "at"/"company" that aren't actually naming
// a company (e.g. "At least 3 years of experience...", "At Acme, we believe
// in...").
const COMPANY_MAX_WORDS = 6;

/**
 * Best-effort title/company guess from freshly pasted posting text, so the
 * Add Job Posting modal can pre-fill those fields. Deliberately conservative
 * -- an empty guess is better than a wrong one, since a wrong guess is more
 * work to notice and fix than just typing it. Callers must only use a guess
 * to fill a field that's still empty, never to overwrite user input.
 * In plain terms: tries to figure out the job title and company from the
 * pasted text, leaving them blank if it's not confident.
 */
export function guessJobTitleAndCompany(rawText: string): { title?: string; company?: string } {
  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const firstLine = lines[0];
  const title = firstLine && firstLine.length <= 100 && !firstLine.endsWith('.') ? firstLine : undefined;

  let company: string | undefined;
  for (const line of lines.slice(0, GUESS_SCAN_LINES)) {
    const match = line.match(COMPANY_LINE);
    if (match) {
      const candidate = match[1].trim();
      if (candidate === '' || candidate.split(/\s+/).length > COMPANY_MAX_WORDS) continue;
      company = candidate;
      break;
    }
  }

  return { title, company };
}

// How each arrangement is written in a posting.
const ARRANGEMENT_WORDS: Record<(typeof ARRANGEMENTS)[number], RegExp> = {
  Onsite: /\bon[- ]?site\b/i,
  Hybrid: /\bhybrid\b/i,
  Remote: /\bremote\b/i,
};

/**
 * Splits an arrangement word out of a location, e.g. "Manila (Hybrid)"
 * becomes "Manila" and "Hybrid". Brackets and separators left behind are
 * trimmed.
 * In plain terms: pulls "Hybrid" or "Remote" out of the location so each
 * lands in its own field.
 */
export function splitLocation(location: string): { place: string; arrangement?: string } {
  for (const arrangement of ARRANGEMENTS) {
    const word = ARRANGEMENT_WORDS[arrangement];
    if (!word.test(location)) continue;
    const place = location
      .replace(word, '')
      .replace(/\(\s*\)|\[\s*\]/g, '')
      .replace(/^[\s,\-–|/·]+|[\s,\-–|/·(]+$/g, '')
      .trim();
    return { place, arrangement };
  }
  return { place: location };
}

/**
 * Fills a posting's empty title, company, location and arrangement from what
 * the posting read found. A value is used only when it appears word for word in the
 * posting text, so nothing invented gets in. A title is also replaced while
 * it is still exactly the Add dialog's first-line guess, since the read gives
 * a cleaner one; anything the user typed is kept. An arrangement is used
 * only when the posting says it, and one written into the location
 * ("Manila (Hybrid)") is moved out of it.
 * In plain terms: fills in the job title, company, location and arrangement
 * for you, without touching anything you typed.
 */
export function fillPostingDetails(
  posting: JobPosting,
  found: { title?: string; company?: string; location?: string; arrangement?: string },
): JobPosting {
  const text = posting.rawText.toLowerCase();
  const usable = (value?: string) => {
    const v = value?.trim();
    return v && text.includes(v.toLowerCase()) ? v : undefined;
  };
  const isEmpty = (value?: string) => !value?.trim();
  const title = usable(found.title);
  const company = usable(found.company);
  const split = splitLocation(usable(found.location) ?? '');
  const location = split.place || undefined;
  const named = ARRANGEMENTS.find((a) => a.toLowerCase() === found.arrangement?.trim().toLowerCase());
  const arrangement = named && ARRANGEMENT_WORDS[named].test(posting.rawText) ? named : split.arrangement;
  const titleIsGuess = posting.title?.trim() === guessJobTitleAndCompany(posting.rawText).title;
  return {
    ...posting,
    ...(title && (isEmpty(posting.title) || titleIsGuess) ? { title } : {}),
    ...(company && isEmpty(posting.company) ? { company } : {}),
    ...(location && isEmpty(posting.location) ? { location } : {}),
    ...(arrangement && isEmpty(posting.arrangement) ? { arrangement } : {}),
  };
}

// A short display label for a posting: prefers the analysis's role summary,
// falls back to the first non-empty line of the pasted text, then to a
// generic placeholder for a blank posting. Truncated so it fits on one line
// in the postings list.
// In plain terms: the short title shown for a job in your saved postings list.
export function postingLabel(posting: JobPosting): string {
  const source =
    posting.title?.trim() ||
    posting.analysis?.roleSummary.trim() ||
    posting.rawText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ||
    'Untitled posting';

  return source.length > LABEL_MAX_CHARS
    ? `${source.slice(0, LABEL_MAX_CHARS)}…`
    : source;
}
