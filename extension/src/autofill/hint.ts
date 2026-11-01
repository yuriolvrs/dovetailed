// What this file is: the in-page Fill button. It shows a small button inside a focused text field when the page holds an application form, and runs the shared fill when a real user clicks it.
// In plain terms: a tiny Dovetailed button that appears in the form you click into, so you can fill the page without opening the popup.
import { MARK_PATHS, MARK_VIEW_BOX } from '../../../src/lib/brandMark';
import { isBlockedSite } from '../lib/blockedSites';
import { detectFields } from './detect';
import type { FrameResult } from './report';

export interface HintOptions {
  /** Runs the fill. It is called only from a trusted click, never earlier. */
  runFill: () => Promise<FrameResult>;
  /** Address used for the blocked-site check. Defaults to the page address. */
  url?: string;
  /** Wait after focus before detection runs. */
  debounceMs?: number;
  /** For tests only: jsdom cannot make trusted events. The real script never sets this. */
  isTrusted?: (e: Event) => boolean;
}

const TEXT_TYPES = new Set(['', 'text', 'email', 'tel', 'url', 'search']);
const BUTTON_SIZE = 28;
const EDGE_GAP = 6;
const RESULT_MS = 6000;
const LABEL = 'Fill with Dovetailed';

/**
 * True for a plain text field the user can type in. Password, hidden, file and choice inputs are not.
 * In plain terms: is this a box where a person types words?
 */
export function isTextLikeField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  return el instanceof HTMLInputElement && TEXT_TYPES.has(el.type) && !el.disabled && !el.readOnly;
}

/** True when `node` is inside `scope`, walking out of open shadow roots. */
function within(scope: Node, node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parentNode ?? (n as ShadowRoot).host ?? null) if (n === scope) return true;
  return false;
}

/** The short result text. It holds counts only, never field values. */
function resultText(r: FrameResult): string {
  if (r.blocked || !r.formFound) return 'No application form found.';
  const filled = `Filled ${r.filled} ${r.filled === 1 ? 'field' : 'fields'}.`;
  const blank = r.requiredBlank.length;
  return blank ? `${filled} ${blank} required ${blank === 1 ? 'field is' : 'fields are'} blank.` : filled;
}

const STYLE = `
:host { all: initial; }
.row { position: fixed; display: flex; align-items: center; gap: 2px; font: 12px/1.3 system-ui, sans-serif; }
button { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.fill { width: ${BUTTON_SIZE}px; height: ${BUTTON_SIZE}px; border-radius: 8px; background: #0f172a; color: #fff;
  box-shadow: 0 0 0 1px rgba(255,255,255,.6), 0 1px 4px rgba(0,0,0,.4); }
.fill:hover { background: #1e293b; }
.fill[disabled] { opacity: .6; cursor: default; }
.dismiss { width: 18px; height: 18px; border-radius: 9px; background: #0f172a; color: #fff; font-size: 12px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.6), 0 1px 3px rgba(0,0,0,.4); }
.dismiss:hover { background: #1e293b; }
button:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
.result { position: absolute; top: ${BUTTON_SIZE + 6}px; right: 0; width: max-content; max-width: 240px; padding: 6px 10px;
  border-radius: 8px; background: #0f172a; color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.6), 0 2px 8px rgba(0,0,0,.4); }
.result:empty { display: none; }
`;

/**
 * Starts the in-page button. It listens for focus on text fields and returns a function that stops it.
 * It does nothing on blocked sites. Detection reads field labels only. The profile is read only
 * after a trusted click, inside runFill.
 * In plain terms: turns the small button on, and hands back a switch to turn it off.
 */
export function installHint(doc: Document, options: HintOptions): () => void {
  if (isBlockedSite(options.url ?? doc.location.href)) return () => {};
  const debounceMs = options.debounceMs ?? 200;

  let dismissed = false;
  let field: HTMLInputElement | HTMLTextAreaElement | null = null;
  let host: HTMLElement | null = null;
  let row: HTMLElement | null = null;
  let fillBtn: HTMLButtonElement | null = null;
  let result: HTMLElement | null = null;
  let focusTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let resultTimer: ReturnType<typeof setTimeout> | undefined;

  function build() {
    host = doc.createElement('div');
    host.setAttribute('data-dovetailed-hint', '');
    const root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLE;

    row = doc.createElement('div');
    row.className = 'row';

    fillBtn = doc.createElement('button');
    fillBtn.type = 'button';
    fillBtn.className = 'fill';
    fillBtn.setAttribute('aria-label', LABEL);
    fillBtn.title = LABEL;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', MARK_VIEW_BOX);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of MARK_PATHS) {
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    fillBtn.append(svg);

    const dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'dismiss';
    dismiss.setAttribute('aria-label', 'Hide the Dovetailed button on this page');
    dismiss.title = 'Hide on this page';
    dismiss.textContent = '×';

    result = doc.createElement('div');
    result.className = 'result';
    result.setAttribute('role', 'status');

    // Keep focus in the page field while the buttons are pressed.
    for (const b of [fillBtn, dismiss]) b.addEventListener('mousedown', (e) => e.preventDefault());
    fillBtn.addEventListener('click', onFillClick);
    dismiss.addEventListener('click', () => {
      dismissed = true;
      hide();
    });

    row.append(fillBtn, dismiss, result);
    root.append(style, row);
    doc.documentElement.append(host);
  }

  // Runs only for a real user click. A click made by page script has isTrusted false and is ignored.
  async function onFillClick(e: Event) {
    if (!(options.isTrusted ?? ((ev: Event) => ev.isTrusted))(e) || !fillBtn || !result) return;
    fillBtn.disabled = true;
    result.textContent = 'Filling…';
    let text: string;
    try {
      text = resultText(await options.runFill());
    } catch {
      text = 'Could not fill this form.';
    }
    fillBtn.disabled = false;
    result.textContent = text;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
      if (result) result.textContent = '';
    }, RESULT_MS);
  }

  function place() {
    if (!field || !row) return;
    const r = field.getBoundingClientRect();
    const top = field instanceof HTMLTextAreaElement ? r.top + EDGE_GAP : r.top + (r.height - BUTTON_SIZE) / 2;
    // The row is two controls wide. It sits against the field's right edge, inside it.
    row.style.top = `${Math.round(top)}px`;
    row.style.left = `${Math.round(r.right - EDGE_GAP - BUTTON_SIZE - 20)}px`;
  }

  function show(el: HTMLInputElement | HTMLTextAreaElement) {
    clearTimeout(hideTimer);
    if (field !== el && result) result.textContent = '';
    field = el;
    if (!host) build();
    place();
  }

  function hide() {
    clearTimeout(resultTimer);
    host?.remove();
    host = row = fillBtn = result = null;
    field = null;
  }

  function evaluate(el: HTMLInputElement | HTMLTextAreaElement) {
    if (dismissed || !el.isConnected) return;
    const { scope } = detectFields(doc);
    if (scope && within(scope, el)) show(el);
    else hide();
  }

  function onFocusIn(e: Event) {
    const target = e.composedPath()[0] ?? e.target;
    clearTimeout(focusTimer);
    clearTimeout(hideTimer);
    if (dismissed || !isTextLikeField(target)) {
      // Focus moved to something else. Remove any button after a short pause.
      if (!(target instanceof Node && host && within(host, target))) hide();
      return;
    }
    focusTimer = setTimeout(() => evaluate(target), debounceMs);
  }

  function onFocusOut() {
    clearTimeout(focusTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 250);
  }

  const reposition = () => place();
  doc.addEventListener('focusin', onFocusIn, true);
  doc.addEventListener('focusout', onFocusOut, true);
  doc.defaultView?.addEventListener('scroll', reposition, true);
  doc.defaultView?.addEventListener('resize', reposition);

  return () => {
    doc.removeEventListener('focusin', onFocusIn, true);
    doc.removeEventListener('focusout', onFocusOut, true);
    doc.defaultView?.removeEventListener('scroll', reposition, true);
    doc.defaultView?.removeEventListener('resize', reposition);
    clearTimeout(focusTimer);
    clearTimeout(hideTimer);
    hide();
  };
}
