// What this file is: tests for the in-page Fill button. They cover when it shows, that it never reads the profile early, and that only a trusted click runs a fill.
// In plain terms: checks the small button shows only on real application forms, and only a real click can use it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installHint, isTextLikeField } from './hint';
import type { FrameResult } from './report';

const FORM = `
  <form>
    <label for="fn">First name</label><input id="fn" name="first_name" />
    <label for="ln">Last name</label><input id="ln" name="last_name" />
    <label for="em">Email</label><input id="em" type="email" name="email" />
    <label for="pw">Password</label><input id="pw" type="password" name="pw" />
  </form>`;
const SIGN_IN = `<form><label for="em">Email</label><input id="em" type="email" name="email" />
  <label for="pw">Password</label><input id="pw" type="password" name="pw" /></form>`;

const result = (over: Partial<FrameResult> = {}): FrameResult => ({
  url: 'http://localhost/', blocked: false, formFound: true, filled: 3, requiredBlank: [], incomplete: [], fields: [], ...over,
});

let stop: () => void = () => {};
const runFill = vi.fn();
const host = () => document.querySelector('[data-dovetailed-hint]') as HTMLElement | null;
const inShadow = (sel: string) => host()?.shadowRoot?.querySelector(sel) as HTMLElement | null | undefined;
const focus = async (id: string) => {
  document.getElementById(id)!.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
  await vi.advanceTimersByTimeAsync(300);
};
const start = (opts: Partial<Parameters<typeof installHint>[1]> = {}) => {
  stop = installHint(document, { runFill, isTrusted: () => true, ...opts });
};

beforeEach(() => {
  vi.useFakeTimers();
  runFill.mockReset();
  runFill.mockResolvedValue(result());
});
afterEach(() => {
  stop();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('when the button shows', () => {
  it('shows inside a focused field on an application form, with an accessible name', async () => {
    document.body.innerHTML = FORM;
    start();
    await focus('fn');
    expect(host()).not.toBeNull();
    expect(inShadow('.fill')?.getAttribute('aria-label')).toBe('Fill with Dovetailed');
    expect(inShadow('.dismiss')?.getAttribute('aria-label')).toMatch(/hide/i);
    expect(host()!.shadowRoot!.mode).toBe('open');
  });

  it('does not show on a page with no form', async () => {
    document.body.innerHTML = '<input id="q" type="search" name="q" />';
    start();
    await focus('q');
    expect(host()).toBeNull();
  });

  it('does not show on a sign-in form', async () => {
    document.body.innerHTML = SIGN_IN;
    start();
    await focus('em');
    expect(host()).toBeNull();
  });

  it('does not show when a password field is focused', async () => {
    document.body.innerHTML = FORM;
    start();
    await focus('pw');
    expect(host()).toBeNull();
  });

  it('does not show on a blocked site, even on a form', async () => {
    document.body.innerHTML = FORM;
    start({ url: 'https://ph.indeed.com/apply' });
    await focus('fn');
    expect(host()).toBeNull();
  });

  it('waits for the debounce before it runs detection', async () => {
    document.body.innerHTML = FORM;
    start();
    document.getElementById('fn')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    expect(host()).toBeNull();
    await vi.advanceTimersByTimeAsync(300);
    expect(host()).not.toBeNull();
  });

  it('hides when focus leaves, and stays hidden for the page after dismiss', async () => {
    document.body.innerHTML = FORM;
    start();
    await focus('fn');
    inShadow('.dismiss')!.click();
    expect(host()).toBeNull();
    await focus('ln');
    expect(host()).toBeNull();
  });

  it('stops listening after the stop function runs', async () => {
    document.body.innerHTML = FORM;
    start();
    stop();
    await focus('fn');
    expect(host()).toBeNull();
  });
});

describe('what a click can do', () => {
  it('reads nothing and runs nothing before a click', async () => {
    document.body.innerHTML = FORM;
    start();
    await focus('fn');
    await focus('em');
    expect(runFill).not.toHaveBeenCalled();
  });

  it('ignores a synthetic click', async () => {
    document.body.innerHTML = FORM;
    start({ isTrusted: undefined });
    await focus('fn');
    inShadow('.fill')!.click();
    inShadow('.fill')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(50);
    expect(runFill).not.toHaveBeenCalled();
  });

  it('runs the fill once on a trusted click and shows counts only', async () => {
    document.body.innerHTML = FORM;
    runFill.mockResolvedValue(result({ filled: 5, requiredBlank: ['Phone', 'City'] }));
    start();
    await focus('fn');
    inShadow('.fill')!.click();
    await vi.advanceTimersByTimeAsync(50);
    expect(runFill).toHaveBeenCalledTimes(1);
    expect(inShadow('.result')?.textContent).toBe('Filled 5 fields. 2 required fields are blank.');
  });

  it('shows a plain message when the fill fails', async () => {
    document.body.innerHTML = FORM;
    runFill.mockRejectedValue(new Error('secret detail'));
    start();
    await focus('fn');
    inShadow('.fill')!.click();
    await vi.advanceTimersByTimeAsync(50);
    expect(inShadow('.result')?.textContent).toBe('Could not fill this form.');
  });
});

describe('isTextLikeField', () => {
  it('accepts text-like fields only', () => {
    document.body.innerHTML = '<input id="a"/><input id="b" type="password"/><input id="c" type="checkbox"/><textarea id="d"></textarea><input id="e" disabled/>';
    const el = (id: string) => document.getElementById(id);
    expect([...'abcde'].map((i) => isTextLikeField(el(i)))).toEqual([true, false, false, true, false]);
  });
});
