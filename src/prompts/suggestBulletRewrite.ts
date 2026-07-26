// What this file is: the prompt and safety filter for the opt-in "suggest a
// rewording" resume feature. Unlike selectResumeContent.ts (which never
// calls the LLM at all, after an earlier design fabricated technical claims
// -- see that file's header), this feature does call the LLM, but only on
// explicit per-bullet user request, only to reword one bullet's own text,
// and every suggestion is filtered for new proper-noun-like terms or numbers
// before ever being shown -- and even then the user must click to apply it,
// nothing is ever auto-applied.
// In plain terms: lets the AI suggest tighter wording for one bullet at a
// time, with guardrails against it sneaking in a skill or number you didn't
// actually write, and always leaves the final call to you.

const MAX_BULLET_CHARS = 500;

/**
 * In plain terms: the instructions sent to the AI when you ask it to reword
 * one bullet point.
 */
export function buildSuggestBulletRewritePrompt(bulletText: string): string {
  const truncated = bulletText.slice(0, MAX_BULLET_CHARS);
  return `You are tightening a single resume bullet point's wording.

Bullet: "${truncated}"

Rewrite it to be more concise and impactful, using ONLY the skills, tools,
actions, and facts already stated in this exact bullet. Do not add any skill,
technology, tool, company name, metric, percentage, or duration that isn't
already present in the bullet above. Do not invent achievements or outcomes
that aren't already implied. If the bullet is already tight and can't be
improved without adding something new, return an empty list.

Respond with JSON only, no markdown fences, in this exact shape:
{"suggestions": ["alternative phrasing 1", "alternative phrasing 2"]}

Return at most 3 suggestions.`;
}

export interface RewriteSuggestions {
  suggestions: string[];
}

/**
 * Structural validator for generateStructured -- array of 0-3 non-empty
 * strings.
 * In plain terms: checks the AI's response actually looks like a short list
 * of text suggestions.
 */
export function isRewriteSuggestions(x: unknown): x is RewriteSuggestions {
  if (typeof x !== 'object' || x === null) return false;
  const suggestions = (x as { suggestions?: unknown }).suggestions;
  return (
    Array.isArray(suggestions) &&
    suggestions.length <= 3 &&
    suggestions.every((s) => typeof s === 'string' && s.trim() !== '')
  );
}

// Skips the first word before matching -- a bullet's opening word is always
// capitalized as ordinary sentence case (e.g. "Developed", "Led"), not a
// signal of a proper noun, so checking it would flag nearly every rewrite
// (which almost always opens with a different verb) as unsafe.
// In plain terms: finds capitalized words that look like proper nouns
// (skill/tool/company names), ignoring the ordinary capital letter every
// bullet starts a sentence with.
function capitalizedTerms(text: string): Set<string> {
  const trimmed = text.trim();
  const firstSpace = trimmed.search(/\s/);
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace);
  const matches = rest.match(/\b[A-Z][a-zA-Z0-9+#.]*\b/g) ?? [];
  return new Set(matches.map((m) => m.toLowerCase()));
}

function numbers(text: string): Set<string> {
  return new Set(text.match(/\d+/g) ?? []);
}

/**
 * Whether a suggested rewording introduces a proper-noun-like term
 * (potential skill/tool/technology/company name) or a number (potential
 * invented duration/metric) that wasn't in the original bullet. This is a
 * heuristic, not a complete fabrication check -- it directly targets the two
 * failure modes an earlier LLM-rewriting design actually produced (see
 * selectResumeContent.ts's file header: invented technologies like "Spring
 * Boot", and invented durations/quantities), rather than blocking every
 * paraphrase (which would make the feature useless, since almost any rewrite
 * changes some ordinary words).
 * In plain terms: flags a suggestion as unsafe if it mentions a
 * capitalized-looking name or a number that wasn't in your original bullet.
 */
export function introducesUnsupportedClaims(original: string, suggestion: string): boolean {
  const newCapitalized = [...capitalizedTerms(suggestion)].some((term) => !capitalizedTerms(original).has(term));
  const newNumbers = [...numbers(suggestion)].some((n) => !numbers(original).has(n));
  return newCapitalized || newNumbers;
}

/**
 * Filters a raw list of suggestions down to ones that pass the
 * unsupported-claims check -- callers should only ever show these to the
 * user, never the raw LLM output.
 * In plain terms: throws out any suggested rewording that looks like it
 * added a skill or number you didn't already write.
 */
export function filterSafeSuggestions(original: string, suggestions: string[]): string[] {
  return suggestions.filter((s) => !introducesUnsupportedClaims(original, s));
}
