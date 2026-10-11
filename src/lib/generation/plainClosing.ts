// What this file is: decides whether a cover letter's closing paragraph is a
// plain sign-off with nothing to verify. The cover letter prompt requires the
// last paragraph to be a thank-you with no new claims, so it cites no evidence;
// flagging it as "not traceable" on every letter taught users to ignore the
// flag. It still counts as a claim when it names anything specific.
// In plain terms: works out whether the last paragraph is just "thank you,
// I look forward to talking", which needs no evidence.

import { capitalizedTerms, numbers } from '../../prompts/suggestBulletRewrite';

/**
 * True when every proper-noun-like word and number in `paragraph` also
 * appears in `allowedText` (the posting, role, company and candidate name).
 * The first word of each sentence and the pronoun "I" are not treated as
 * names, since they are capitalized anyway.
 * In plain terms: the paragraph mentions no tool, employer, school or figure
 * that isn't already in the job posting or your name.
 */
export function isPlainClosing(paragraph: string, allowedText: string): boolean {
  const allowed = allowedText.toLowerCase();
  // Trailing dots are sentence ends, not part of a name ("Freight." -> "freight").
  const clean = (w: string) => w.replace(/\.+$/, '');
  const words = new Set((allowed.match(/[a-z0-9+#.]+/g) ?? []).map(clean));
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    for (const term of capitalizedTerms(sentence)) {
      const t = clean(term);
      if (t !== 'i' && t !== '' && !words.has(t)) return false;
    }
    for (const n of numbers(sentence)) {
      if (!words.has(n)) return false;
    }
  }
  return true;
}
