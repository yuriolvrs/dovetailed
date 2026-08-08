// What this file is: escapes LaTeX special characters in plain text so
// resume content (names, bullets, etc.) can be safely injected into a .tex
// template without breaking compilation or letting stray text be
// interpreted as LaTeX commands. Pure and deterministic (PRD §9/§13 --
// filling the same template twice with the same data must be byte-identical).
// In plain terms: makes sure your resume text (which may contain things
// like "&", "%", or "#") doesn't accidentally break the LaTeX file.

const ESCAPE_MAP: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

// Matches against the original string only (a single pass), so replacement
// text containing further special characters (e.g. the backslash in
// "\textbackslash{}") is never re-scanned/double-escaped.
const ESCAPE_REGEX = /[\\{}$&#_%~^]/g;

export function escapeLatex(text: string): string {
  return text.replace(ESCAPE_REGEX, (ch) => ESCAPE_MAP[ch]);
}
