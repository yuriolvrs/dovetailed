// What this file is: the prompt and response filter for the opt-in "AI
// Categorize" action on the Skills section -- takes the flat list of skill
// items the user already typed and asks the model to group them under
// sensible category headings. The model is only ever given skills the user
// already entered and told not to add/remove/reword any, and
// reconcileCategorization() then discards any skill in the response that
// doesn't match an original item (case/whitespace-insensitive), so this
// cannot introduce a skill the user didn't write. Any original skill the
// model drops or mangles beyond recognition is put back under an "Other"
// category so nothing silently disappears.
// In plain terms: lets the AI sort your existing skill list into groups
// like "Tools" or "Leadership", without being able to invent a new skill
// you never entered, and without ever losing one you did.

export function buildCategorizeSkillsPrompt(items: string[]): string {
  return `Group the following resume skills into a small number of clear
categories (e.g. "Technical Skills", "Leadership & Communication", "Tools &
Software"). Use ONLY the skills listed below -- do not add, remove, merge, or
reword any skill. Every skill must appear in exactly one category, spelled
exactly as given.

Skills:
${items.map((i) => `- ${i}`).join('\n')}

Respond with JSON only, no markdown fences, in this exact shape:
{"categories": [{"category": "Category Name", "items": ["skill 1", "skill 2"]}]}

Use 2-5 categories. Category names should be short (2-4 words).`;
}

export interface CategorizeSkillsResult {
  categories: { category: string; items: string[] }[];
}

/**
 * Structural validator for generateStructured -- a non-empty list of
 * {category, items[]} groups.
 * In plain terms: checks the AI's response actually looks like a list of
 * named skill groups.
 */
export function isCategorizeSkillsResult(x: unknown): x is CategorizeSkillsResult {
  if (typeof x !== 'object' || x === null) return false;
  const categories = (x as { categories?: unknown }).categories;
  if (!Array.isArray(categories) || categories.length === 0) return false;
  return categories.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as { category?: unknown }).category === 'string' &&
      Array.isArray((c as { items?: unknown }).items) &&
      (c as { items: unknown[] }).items.every((i) => typeof i === 'string'),
  );
}

/**
 * Filters the model's grouping down to only skills that were actually in
 * the original list (case/whitespace-insensitive match), preserving each
 * skill's original casing and dropping duplicates. Any original skill the
 * model left out or renamed beyond recognition is appended under an "Other"
 * category, so no skill is ever silently lost.
 * In plain terms: makes sure every skill you started with is still there
 * somewhere after the AI sorts them, even if it mishandled one.
 */
export function reconcileCategorization(
  originalItems: string[],
  result: CategorizeSkillsResult,
): { category: string; items: string[] }[] {
  const byNormalized = new Map(originalItems.map((i) => [i.trim().toLowerCase(), i]));
  const used = new Set<string>();

  const categories = result.categories
    .map((c) => ({
      category: c.category.trim() || 'Skills',
      items: c.items
        .map((i) => byNormalized.get(i.trim().toLowerCase()))
        .filter((i): i is string => {
          if (!i || used.has(i)) return false;
          used.add(i);
          return true;
        }),
    }))
    .filter((c) => c.items.length > 0);

  const leftover = originalItems.filter((i) => !used.has(i));
  if (leftover.length > 0) {
    categories.push({ category: 'Other', items: leftover });
  }
  return categories;
}
