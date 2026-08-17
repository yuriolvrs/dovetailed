// What this file is: the anti-fabrication check for imported documents. The
// extractor is told to transcribe, not write, so every string it returns
// should already appear in the document -- this proves that per field and
// reports the ones that don't, for the review screen to flag.
// In plain terms: checks the AI actually copied your resume rather than
// making anything up, and lists anything it can't find in the file.

import type { ExtractedProfile } from '../../prompts/extractProfile';

export interface UnverifiedField {
  /** Dotted locator into the extracted shape, e.g. "experience.1.bullets.0". */
  path: string;
  text: string;
}

// The document reader returns markdown, not plain text -- headings arrive as
// "# Title", emphasis as "**bold**", bullets as "- item", tables as pipes.
// The extractor is asked for clean field values, so the same sentence is
// decorated in the corpus and bare in the extraction. Stripping the syntax
// (not just whitespace and case) is what stops every field from being
// wrongly flagged as unverified.
// In plain terms: ignores markdown formatting so "**Acme**" and "Acme" count
// as the same text.
function stripMarkdown(value: string): string {
  return (
    value
      // Fenced/inline code markers and table pipes.
      .replace(/[`|]/g, ' ')
      // Leading heading, quote, and list markers on each line.
      .replace(/^[ \t]*(#{1,6}|>|[-*+])[ \t]+/gm, ' ')
      // Leading numbered-list markers.
      .replace(/^[ \t]*\d+[.)][ \t]+/gm, ' ')
      // Emphasis/strikethrough runs.
      .replace(/(\*\*|__|\*|_|~~)/g, '')
      // Link/image syntax: keep the label, drop the target.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  );
}

/**
 * Reduces text to a form where only the words matter -- markdown stripped,
 * unicode punctuation folded to ASCII, case and whitespace normalized.
 * In plain terms: boils text down so trivial formatting differences don't
 * make two identical sentences look different.
 */
export function normalizeForCompare(value: string): string {
  return stripMarkdown(value)
    .toLowerCase()
    // Smart quotes, dashes, and non-breaking spaces to their ASCII forms.
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/[  -​]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when `value` appears in an already-normalized document. Empty values
 * count as present -- there is nothing to fabricate in a blank field. Takes
 * the corpus pre-normalized because a single verification pass checks ~30
 * fields against the same document.
 * In plain terms: did this piece of text actually come from the file?
 */
export function isPresentInCorpus(value: string, normalizedCorpus: string): boolean {
  const needle = normalizeForCompare(value);
  return needle === '' || normalizedCorpus.includes(needle);
}

/**
 * Walks every user-visible string in an extracted profile and returns the ones
 * that aren't in the document. Dates, flags, and structural fields are skipped
 * -- a date is reformatted by design, so checking it verbatim would flag
 * correct output. Bullets, names, and titles are the fabrication risk, and
 * those are checked.
 * In plain terms: the list of things to warn you about before importing.
 */
export function verifyExtractedProfile(
  extracted: ExtractedProfile,
  corpus: string,
): UnverifiedField[] {
  const unverified: UnverifiedField[] = [];
  const normalizedCorpus = normalizeForCompare(corpus);

  const check = (path: string, text: string | undefined) => {
    if (text && !isPresentInCorpus(text, normalizedCorpus)) unverified.push({ path, text });
  };

  check('contact.name', extracted.contact?.name);
  check('contact.email', extracted.contact?.email);
  check('contact.phone', extracted.contact?.phone);
  check('contact.location', extracted.contact?.location);

  extracted.skills?.forEach((group, g) => {
    group.items?.forEach((item, i) => check(`skills.${g}.items.${i}`, item));
  });

  extracted.experience?.forEach((entry, e) => {
    check(`experience.${e}.company`, entry.company);
    check(`experience.${e}.title`, entry.title);
    entry.bullets?.forEach((bullet, b) => check(`experience.${e}.bullets.${b}`, bullet));
  });

  extracted.projects?.forEach((entry, p) => {
    check(`projects.${p}.name`, entry.name);
    check(`projects.${p}.description`, entry.description);
    entry.bullets?.forEach((bullet, b) => check(`projects.${p}.bullets.${b}`, bullet));
  });

  extracted.education?.forEach((entry, d) => {
    check(`education.${d}.school`, entry.school);
    check(`education.${d}.degree`, entry.degree);
  });

  return unverified;
}
