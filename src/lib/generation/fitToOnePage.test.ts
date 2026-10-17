// What this file is: unit tests for the one-page measurement loop, with React
// rendering and the DOM replaced by small fakes (the test runner has no DOM).
// In plain terms: proves the resume fit check finishes even when the browser
// tab is hidden, and that Stop cancels it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResumeContent } from '../../types';
import { fitToOnePage, overflowsOnePage } from './fitToOnePage';

vi.mock('react-dom', () => ({ flushSync: (fn: () => void) => fn() }));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: () => {}, unmount: () => {} }) }));
vi.mock('../../components/resume/ResumePrintView', () => ({ ResumePrintView: () => null }));

// The fake page's rendered height; 100 is the page height, so above it overflows.
let renderedHeight = 50;

beforeEach(() => {
  renderedHeight = 50;
  vi.stubGlobal('document', {
    visibilityState: 'hidden',
    createElement: () => ({
      style: {},
      get scrollHeight() {
        return renderedHeight;
      },
      clientHeight: 100,
      remove: () => {},
    }),
    body: { appendChild: () => {} },
  });
  // Hidden tabs never fire animation frames.
  vi.stubGlobal('requestAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const content = { experience: [], projects: [] } as unknown as ResumeContent;

describe('overflowsOnePage', () => {
  it('resolves in a hidden tab where requestAnimationFrame never fires', async () => {
    await expect(overflowsOnePage(content)).resolves.toBe(false);
    renderedHeight = 150;
    await expect(overflowsOnePage(content)).resolves.toBe(true);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });
});

describe('fitToOnePage', () => {
  it('resolves in a hidden tab', async () => {
    await expect(fitToOnePage(content, [])).resolves.toEqual({ content, removedExperience: [], fits: true });
  });

  it('throws an AbortError when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fitToOnePage(content, [], controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
