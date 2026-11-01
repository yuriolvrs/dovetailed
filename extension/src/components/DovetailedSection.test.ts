// What this file is: behaviour tests for the "Copy from Dovetailed" section. It renders with react-dom in jsdom.
// In plain terms: checks the click flow, the overwrite notice with its two buttons, and the error messages.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionProfile } from '../types/profile';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = vi.fn();
vi.mock('../lib/dovetailedLink', async (orig) => ({
  ...(await orig<typeof import('../lib/dovetailedLink')>()),
  readDovetailedProfile: () => read(),
}));

import { DovetailedAccessError } from '../lib/dovetailedLink';
import { DovetailedSection } from './DovetailedSection';

const row = {
  contact: { name: 'Testa Examplo', email: 'new@example.invalid', links: [] },
  experience: [],
  education: [],
};
const base: ExtensionProfile = { version: 1, firstName: '', lastName: '', email: '', links: [], experience: [], education: [] };

let host: HTMLDivElement;
let root: Root;
const onProfile = vi.fn();
const button = (label: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const click = async (label: string) => {
  await act(async () => {
    button(label)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const show = (profile: ExtensionProfile) => act(() => root.render(createElement(DovetailedSection, { profile, onProfile })));

beforeEach(() => {
  read.mockReset();
  onProfile.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Copy from Dovetailed', () => {
  it('copies straight into an empty form and reports the count', async () => {
    read.mockResolvedValue(row);
    show(base);
    await click('Copy from Dovetailed');
    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Testa', email: 'new@example.invalid' }));
    expect(host.textContent).toContain('Changed 3 fields. Check them, then Save.');
  });

  it('asks first when values would be replaced, and Fill empty only keeps them', async () => {
    read.mockResolvedValue(row);
    show({ ...base, email: 'mine@example.invalid' });
    await click('Copy from Dovetailed');
    expect(onProfile).not.toHaveBeenCalled();
    expect(host.textContent).toContain('This would replace: Email.');
    await click('Fill empty only');
    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({ email: 'mine@example.invalid', firstName: 'Testa' }));
  });

  it('Replace overwrites the conflicting value', async () => {
    read.mockResolvedValue(row);
    show({ ...base, email: 'mine@example.invalid' });
    await click('Copy from Dovetailed');
    await click('Replace');
    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.invalid' }));
  });

  it('shows the three error messages', async () => {
    show(base);
    read.mockResolvedValue(undefined);
    await click('Copy from Dovetailed');
    expect(host.textContent).toContain('No Dovetailed profile in this browser.');
    read.mockRejectedValue(new DovetailedAccessError());
    await click('Copy from Dovetailed');
    expect(host.textContent).toContain('Access to Dovetailed was refused.');
    read.mockRejectedValue(new Error('x'));
    await click('Copy from Dovetailed');
    expect(host.textContent).toContain('Could not read your Dovetailed profile.');
    expect(onProfile).not.toHaveBeenCalled();
  });
});
