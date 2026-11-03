// What this file is: the on-page panel that asks which stored resume to attach. It lives in a closed shadow root next to the file input and resolves the chosen id, or null.
// In plain terms: a small box on the form that says "Attach which resume?" and lists your file names.
import type { ResumeFileRef } from '../types/profile';

export interface ChooserOptions {
  /** For tests only: jsdom cannot make trusted events. The real script never sets this. */
  isTrusted?: (e: Event) => boolean;
}

const PANEL_WIDTH = 260;
const EDGE_GAP = 8;
const TITLE = 'Attach which resume?';

const STYLE = `
:host { all: initial; }
.panel { position: fixed; z-index: 2147483647; box-sizing: border-box; width: ${PANEL_WIDTH}px; max-width: calc(100vw - 16px);
  padding: 10px; border-radius: 8px; background: #0f172a; color: #fff; font: 500 13px/1.3 system-ui, sans-serif;
  box-shadow: 0 0 0 1px rgba(255,255,255,.6), 0 2px 8px rgba(0,0,0,.4); }
.head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.title { margin: 0; font-weight: 600; }
button { all: unset; box-sizing: border-box; cursor: pointer; }
.opt { display: block; width: 100%; padding: 6px 8px; border-radius: 6px; background: #1e293b; margin-top: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.opt:hover { background: #334155; }
.close { width: 18px; height: 18px; border-radius: 9px; text-align: center; line-height: 18px; font-size: 12px; background: #1e293b; }
.close:hover { background: #334155; }
.none { color: #cbd5e1; }
button:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
`;

/**
 * Shows the panel next to `anchor` and resolves with the chosen resume id, or null for
 * "Don't attach", the close button or Escape. Only a trusted click counts. The panel sits in a
 * closed shadow root, shows file names only, and removes itself before the promise resolves.
 * In plain terms: asks you which resume to use and waits for your real click.
 */
export function chooseResume(
  refs: ResumeFileRef[],
  anchor: HTMLElement,
  options: ChooserOptions = {},
): Promise<string | null> {
  const doc = anchor.ownerDocument;
  const trusted = options.isTrusted ?? ((e: Event) => e.isTrusted);

  return new Promise((resolve) => {
    const host = doc.createElement('div');
    host.setAttribute('data-dovetailed-chooser', '');
    const root = host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = STYLE;

    const panel = doc.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', TITLE);

    const title = doc.createElement('p');
    title.className = 'title';
    title.textContent = TITLE;
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', 'Close without attaching');
    close.textContent = '×';
    const head = doc.createElement('div');
    head.className = 'head';
    head.append(title, close);
    panel.append(head);

    function finish(id: string | null) {
      doc.removeEventListener('keydown', onKey, true);
      host.remove();
      resolve(id);
    }
    // A click made by page script has isTrusted false and is ignored.
    const onPress = (id: string | null) => (e: Event) => {
      if (trusted(e)) finish(id);
    };
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && trusted(e)) {
        e.stopPropagation();
        finish(null);
      }
    }

    const options_: HTMLButtonElement[] = [];
    for (const ref of refs) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.title = ref.fileName;
      b.textContent = ref.fileName;
      b.addEventListener('click', onPress(ref.id));
      options_.push(b);
    }
    const none = doc.createElement('button');
    none.type = 'button';
    none.className = 'opt none';
    none.textContent = "Don't attach";
    none.addEventListener('click', onPress(null));
    close.addEventListener('click', onPress(null));
    panel.append(...options_, none);

    root.append(style, panel);
    doc.documentElement.append(host);
    doc.addEventListener('keydown', onKey, true);

    // Next to the input. A hidden input has an empty box, so the panel goes to the top right of the view.
    const view = doc.documentElement;
    const r = anchor.getBoundingClientRect();
    let top = EDGE_GAP;
    let left = Math.max(EDGE_GAP, view.clientWidth - PANEL_WIDTH - EDGE_GAP);
    if (r.width > 0 || r.height > 0) {
      top = Math.max(EDGE_GAP, Math.round(r.bottom + EDGE_GAP));
      left = Math.max(EDGE_GAP, Math.min(Math.round(r.left), view.clientWidth - PANEL_WIDTH - EDGE_GAP));
    }
    // Above the input when there is no room below it.
    const height = panel.getBoundingClientRect().height;
    if (top + height > view.clientHeight - EDGE_GAP && r.height > 0) top = Math.max(EDGE_GAP, Math.round(r.top - height - EDGE_GAP));
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;

    (options_[0] ?? none).focus();
  });
}
