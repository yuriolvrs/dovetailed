// What this file is: an unlisted script the popup injects on click. It counts visible form fields and returns only that number.
// In plain terms: looks at the page and says how many boxes you could fill. It reads no text you typed.
export default defineUnlistedScript(() => {
  const SKIPPED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'file']);
  let count = 0;
  for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea')) {
    if (el instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(el.type)) continue;
    if (el.getClientRects().length === 0) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    count++;
  }
  return count;
});
