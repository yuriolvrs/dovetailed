// What this file is: finds the resume file input on a page, attaches the stored resume to it, and waits for the site to finish its own parsing.
// In plain terms: picks the right "upload resume" box, puts your resume in it, and waits until the site stops changing the form.
import { isHidden, normalizeText } from './detect';
import type { FieldElement } from './detect';

export type ResumeChoice =
  | { status: 'chosen'; input: HTMLInputElement }
  | { status: 'ambiguous'; labels: string[] }
  | { status: 'none' };

const NEGATIVE = /\b(cover|portfolio|photo|picture|avatar|additional|transcript|references?)\b/;
const POSITIVE = /\b(resume|cv|curriculum vitae)\b/;
const PARSER = /\b(pars\w*|autofill|auto fill|import|prefill|pre fill)\b/;

/** Lower-cases, strips accents and punctuation. "Résumé" becomes "resume". */
function plain(s: string): string {
  return normalizeText(s.normalize('NFD').replace(/[̀-ͯ]/g, ''));
}

/** All file inputs under a root, walking open shadow roots. Hidden inputs are included. */
function fileInputs(root: Document | ShadowRoot | Element, out: HTMLInputElement[] = []): HTMLInputElement[] {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el instanceof HTMLInputElement && el.type === 'file') out.push(el);
    if (el.shadowRoot) fileInputs(el.shadowRoot, out);
  }
  return out;
}

/** Text of the label bound to the input. */
function labelText(el: HTMLInputElement): string {
  const parts = Array.from(el.labels ?? []).map((l) => (l.textContent ?? '').replace(/\s+/g, ' ').trim());
  parts.push(el.getAttribute('aria-label') ?? '');
  const by = el.getAttribute('aria-labelledby');
  const root = el.getRootNode() as Document | ShadowRoot;
  if (by) parts.push(...by.split(/\s+/).map((id) => root.getElementById?.(id)?.textContent ?? ''));
  return parts.join(' ').trim();
}

/** The nearest heading that comes before the input, within a few ancestors. */
function headingText(el: HTMLInputElement): string {
  let p = el.parentElement;
  for (let depth = 0; p && depth < 5; depth++, p = p.parentElement) {
    const before = Array.from(p.querySelectorAll('h1, h2, h3, h4, h5, h6, legend, [role="heading"]')).filter(
      (h) => h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const last = before[before.length - 1];
    if (last) return (last.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** Whether the accept list can hold a document. No list means yes. Used only to exclude. */
function acceptsDocuments(el: HTMLInputElement): boolean {
  const accept = el.getAttribute('accept')?.toLowerCase().trim();
  return !accept || /pdf|doc|word|application|\*\/\*|\.rtf|\.txt/.test(accept);
}

/**
 * Chooses the resume input. Scores by id or name, then label, then section heading.
 * `accept` only excludes. Cover letter, portfolio, photo, additional files, transcript and
 * references are rejected. A parser-only dropzone loses to a real resume field.
 * Two equal candidates give "ambiguous", and nothing is attached.
 * In plain terms: finds the one box that wants your resume, or says it cannot tell.
 */
export function findResumeInput(root: Document | ShadowRoot | Element, scope?: Node | null): ResumeChoice {
  let inputs = fileInputs(root);
  if (scope) {
    const inScope = inputs.filter((i) => {
      for (let n: Node | null = i; n; n = n.parentNode ?? (n as ShadowRoot).host ?? null) if (n === scope) return true;
      return false;
    });
    if (inScope.length) inputs = inScope;
  }

  const candidates = inputs
    .map((input) => {
      const idName = plain(`${input.id} ${input.name}`);
      const label = plain(labelText(input));
      const heading = plain(headingText(input));
      return { input, idName, label, heading, own: `${idName} ${label}` };
    })
    // A heading counts against an input only when the input's own id and label do not say "resume".
    .filter((c) => !NEGATIVE.test(c.own) && !(!POSITIVE.test(c.own) && NEGATIVE.test(c.heading)))
    .filter((c) => acceptsDocuments(c.input));

  const weight = (c: (typeof candidates)[number]) =>
    POSITIVE.test(c.idName) ? 3 : POSITIVE.test(c.label) ? 2 : POSITIVE.test(c.heading) ? 1 : 0;
  const parserOnly = (c: (typeof candidates)[number]) =>
    PARSER.test(c.own) || (weight(c) <= 1 && PARSER.test(c.heading));

  const real = candidates.filter((c) => weight(c) > 0 && !parserOnly(c));
  if (real.length) {
    const top = Math.max(...real.map(weight));
    const best = real.filter((c) => weight(c) === top);
    if (best.length === 1) return { status: 'chosen', input: best[0].input };
    return { status: 'ambiguous', labels: best.map((c) => c.label || c.idName || 'file input') };
  }
  const rest = candidates.filter((c) => !parserOnly(c));
  if (rest.length === 1) return { status: 'chosen', input: rest[0].input };
  return { status: 'none' };
}

/**
 * Puts a file into a file input with DataTransfer, then fires input and change events.
 * In plain terms: does what choosing a file in the upload dialog would do.
 */
export function attachResume(input: HTMLInputElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** A string that changes whenever any watched field value changes. */
function snapshotKey(fields: FieldElement[]): string {
  return fields
    .map((f) => (f instanceof HTMLInputElement && (f.type === 'checkbox' || f.type === 'radio') ? String(f.checked) : f.value))
    .join('\u0000');
}

/**
 * Waits until the watched field values stay the same for `stableMs`, or `maxMs` passes.
 * Hidden fields are skipped. Returns true when the values settled.
 * In plain terms: waits for the site to finish filling the form from your resume.
 */
export async function waitForStable(
  root: Document | ShadowRoot | Element,
  list: () => FieldElement[],
  opts: { stableMs?: number; maxMs?: number; pollMs?: number } = {},
): Promise<boolean> {
  void root;
  const { stableMs = 1500, maxMs = 15000, pollMs = 100 } = opts;
  const start = Date.now();
  let last = snapshotKey(list().filter((f) => !isHidden(f)));
  let since = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, pollMs));
    const now = snapshotKey(list().filter((f) => !isHidden(f)));
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= stableMs) {
      return true;
    }
  }
  return false;
}
