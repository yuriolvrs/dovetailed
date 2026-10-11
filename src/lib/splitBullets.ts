// What this file is: turns pasted text into a list of bullet strings. It
// splits on line breaks, drops blank lines, and strips a leading bullet mark
// ("-", "*", "•", "–") or list number ("1.", "2)") from each line.
// In plain terms: when you paste several lines, each line becomes its own
// bullet, without the dots or numbers from wherever you copied them.

const LEADING_MARK = /^\s*(?:[-*•–—▪◦·]|\d{1,2}[.)])\s+/;

/**
 * Splits pasted text into one trimmed string per non-blank line, with a
 * leading bullet mark or list number removed. Never rewrites the words.
 * In plain terms: one line in, one bullet out.
 */
export function splitBullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(LEADING_MARK, '').trim())
    .filter((line) => line !== '');
}
