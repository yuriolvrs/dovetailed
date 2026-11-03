// What this file is: tests for the on-page resume chooser panel. They cover the listed names, trusted clicks only, the three ways to say no, and cleanup.
// In plain terms: checks the "Attach which resume?" box lists your files, answers only to real clicks, and goes away afterwards.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseResume } from './resumeChooser';
import type { ResumeFileRef } from '../types/profile';

const ref = (id: string, fileName: string): ResumeFileRef => ({
  id, fileName, mimeType: 'application/pdf', sizeBytes: 1, updatedAt: 1, storage: 'local',
});
const refs = [ref('a', 'alpha.pdf'), ref('b', 'beta.docx')];
const DONT = "Don't attach";

// The panel root is closed. The test captures it through attachShadow to look inside.
let roots: ShadowRoot[] = [];
const realAttach = Element.prototype.attachShadow;
let anchor: HTMLInputElement;
const host = () => document.querySelector('[data-dovetailed-chooser]');
const buttons = () => Array.from(roots[0].querySelectorAll('button'));
const byText = (t: string) => buttons().find((b) => b.textContent === t)!;

beforeEach(() => {
  roots = [];
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) {
    const root = realAttach.call(this, init);
    roots.push(root);
    return root;
  });
  document.body.innerHTML = '<input id="cv" type="file" />';
  anchor = document.getElementById('cv') as HTMLInputElement;
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.querySelectorAll('[data-dovetailed-chooser]').forEach((n) => n.remove());
});

describe('chooseResume', () => {
  it('uses a closed root, so the page cannot read it', async () => {
    const p = chooseResume(refs, anchor, { isTrusted: () => true });
    expect(host()).not.toBeNull();
    expect(host()!.shadowRoot).toBeNull();
    byText(DONT).click();
    await p;
  });

  it('lists the title, the file names and the no option, and focuses the first option', async () => {
    const p = chooseResume(refs, anchor, { isTrusted: () => true });
    expect(roots[0].textContent).toContain('Attach which resume?');
    expect(buttons().map((b) => b.textContent)).toEqual(['×', 'alpha.pdf', 'beta.docx', DONT]);
    expect(roots[0].activeElement?.textContent).toBe('alpha.pdf');
    byText('alpha.pdf').click();
    await p;
  });

  it('ignores a click that is not trusted', async () => {
    const p = chooseResume(refs, anchor);
    const settled = vi.fn();
    void p.then(settled);
    byText('beta.docx').click();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(host()).not.toBeNull();
    host()!.remove();
  });

  it('resolves the chosen id and removes the panel', async () => {
    const p = chooseResume(refs, anchor, { isTrusted: () => true });
    byText('beta.docx').click();
    expect(await p).toBe('b');
    expect(host()).toBeNull();
  });

  it('resolves null for the no option', async () => {
    const p = chooseResume(refs, anchor, { isTrusted: () => true });
    byText(DONT).click();
    expect(await p).toBeNull();
    expect(host()).toBeNull();
  });

  it('resolves null for the close button', async () => {
    const p = chooseResume(refs, anchor, { isTrusted: () => true });
    byText('×').click();
    expect(await p).toBeNull();
    expect(host()).toBeNull();
  });

  it('resolves null for Escape, and ignores an untrusted Escape', async () => {
    let trusted = false;
    const p = chooseResume(refs, anchor, { isTrusted: () => trusted });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host()).not.toBeNull();
    trusted = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await p).toBeNull();
    expect(host()).toBeNull();
  });

  it('shows names as text, never as markup', async () => {
    const p = chooseResume([ref('x', '<img src=x onerror=alert(1)>.pdf'), ref('y', 'b.pdf')], anchor, {
      isTrusted: () => true,
    });
    expect(roots[0].querySelector('img')).toBeNull();
    byText(DONT).click();
    await p;
  });
});
