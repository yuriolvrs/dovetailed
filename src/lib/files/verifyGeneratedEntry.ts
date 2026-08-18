// What this file is: the anti-fabrication check for a profile entry
// generated from an uploaded document (generateEntryFromDocument.ts). Those
// bullets are deliberately reworded, not transcribed, so verifyExtraction.ts's
// whole-string membership check doesn't apply -- instead this reuses
// suggestBulletRewrite.ts's term-level heuristic (flag any proper-noun-like
// word or number the source doesn't contain), checked against the whole
// document instead of one original bullet.
// In plain terms: checks that a generated bullet didn't sneak in a skill,
// tool, or number that isn't actually in the document you uploaded.

import { capitalizedTerms, numbers } from '../../prompts/suggestBulletRewrite';
import { isPresentInCorpus, normalizeForCompare } from './verifyExtraction';

export interface UnverifiedBullet {
  index: number;
  text: string;
  /** The specific terms that couldn't be found in the source document. */
  terms: string[];
}

/**
 * Flags any generated bullet that introduces a capitalized-looking term or a
 * number not found anywhere in the source document.
 * In plain terms: the list of generated bullets to double-check before you
 * trust them.
 */
export function unverifiedBullets(bullets: string[], documentText: string): UnverifiedBullet[] {
  const normalizedCorpus = normalizeForCompare(documentText);

  return bullets.flatMap((text, index) => {
    const candidates = [...capitalizedTerms(text), ...numbers(text)];
    const terms = candidates.filter((term) => !isPresentInCorpus(term, normalizedCorpus));
    return terms.length > 0 ? [{ index, text, terms }] : [];
  });
}
