// What this file is: behaviour tests for the "Fill profile from resume" flow. It renders with react-dom in jsdom.
// In plain terms: checks that nothing is sent before Continue, that Cancel sends nothing, and that the result is not saved.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionProfile } from '../types/profile';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const extractFromResume = vi.fn();
const saveProfile = vi.fn();
vi.mock('../lib/data', () => ({
  getResume: async () => new File(['x'], 'r.pdf'),
  saveResume: vi.fn(),
  deleteResume: vi.fn(),
  saveProfile: (...a: unknown[]) => saveProfile(...a),
}));
vi.mock('../lib/resumeImport', async (orig) => ({
  ...(await orig<typeof import('../lib/resumeImport')>()),
  extractFromResume: (...a: unknown[]) => extractFromResume(...a),
}));

import { ResumeSection } from './ResumeSection';

const profile: ExtensionProfile = { version: 1, firstName: '', lastName: '', email: '', links: [], experience: [], education: [] };
const resume = { id: 'r', fileName: 'r.pdf', mimeType: 'application/pdf', sizeBytes: 10, updatedAt: 0, storage: 'local' as const };

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

beforeEach(() => {
  extractFromResume.mockReset();
  saveProfile.mockReset();
  onProfile.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(ResumeSection, { resume, onChange: vi.fn(), profile, onProfile })));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Fill profile from resume', () => {
  it('is hidden when no resume is stored', () => {
    act(() => root.render(createElement(ResumeSection, { resume: undefined, onChange: vi.fn(), profile, onProfile })));
    expect(button('Fill profile from resume')).toBeUndefined();
  });

  it('sends nothing before Continue and shows the note', async () => {
    await click('Fill profile from resume');
    expect(host.textContent).toContain("Your resume's text is sent through the Dovetailed proxy to the AI provider that reads it.");
    expect(extractFromResume).not.toHaveBeenCalled();
  });

  it('sends nothing after Cancel', async () => {
    await click('Fill profile from resume');
    await click('Cancel');
    expect(extractFromResume).not.toHaveBeenCalled();
    expect(button('Fill profile from resume')).toBeDefined();
  });

  it('on Continue fills the form but does not save', async () => {
    extractFromResume.mockResolvedValue({
      contact: { name: 'Testa Examplo', email: 'testa@example.invalid', links: [] },
      skills: [], experience: [], projects: [], education: [],
    });
    await click('Fill profile from resume');
    await click('Continue');
    expect(extractFromResume).toHaveBeenCalledTimes(1);
    expect(onProfile).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Testa', lastName: 'Examplo' }));
    expect(host.textContent).toContain('Filled 3 fields. Check them, then Save.');
    expect(saveProfile).not.toHaveBeenCalled();
  });
});
