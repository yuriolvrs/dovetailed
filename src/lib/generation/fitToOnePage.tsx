// What this file is: the DOM-measuring half of one-page fitting. Renders a
// candidate ResumeContent off-screen at exactly the printed page's content
// dimensions (see ResumePrintView.tsx's `@page` rule: letter size, 0.55in
// margins) and checks whether it overflows; if so, asks fitToPage.ts's pure
// nextTrim() what to cut next and repeats. The measurement itself can't be a
// pure function (it needs a real layout pass), so it's kept to this one
// small orchestrator -- what gets cut and in what order is still all in the
// pure, unit-tested fitToPage.ts.
// In plain terms: actually checks in the browser whether the resume fits one
// printed page, and keeps trimming (least important content first) until it
// does or there's nothing left to trim.

import { createRoot } from 'react-dom/client';
import type { ResumeContent, SourceMapEntry } from '../../types';
import { ResumePrintView } from '../../components/resume/ResumePrintView';
import { applyTrim, nextTrim, type TrimStep } from './fitToPage';

// Letter page (8.5in x 11in) minus the 0.55in margins used on both axes by
// ResumePrintView's print CSS.
const CONTENT_WIDTH = '7.4in';
const CONTENT_HEIGHT = '9.9in';

function overflowsOnePage(content: ResumeContent): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.top = '0';
    host.style.left = '-9999px';
    host.style.visibility = 'hidden';
    host.style.width = CONTENT_WIDTH;
    host.style.height = CONTENT_HEIGHT;
    host.style.overflow = 'hidden';
    document.body.appendChild(host);

    const root = createRoot(host);
    root.render(<ResumePrintView content={content} variant="measure" />);

    // Two rAF ticks so the browser has committed layout before we read it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve(host.scrollHeight > host.clientHeight);
        root.unmount();
        host.remove();
      });
    });
  });
}

/**
 * Trims `content` down toward one printed page, cutting the least important
 * content first per fitToPage.ts's nextTrim(), until it fits or nothing more
 * can be cut. `removedExperience` lists whole experience entries that were
 * dropped, in removal order, so the caller can offer to restore them.
 * In plain terms: shrinks a generated resume to fit one page, and reports
 * what got removed so the user can undo it.
 */
export async function fitToOnePage(
  content: ResumeContent,
  sourceMap: SourceMapEntry[],
): Promise<{ content: ResumeContent; removedExperience: ResumeContent['experience'] }> {
  const matchedBulletTexts = new Set(sourceMap.map((e) => e.generatedText));
  let candidate = content;
  const removedExperience: ResumeContent['experience'] = [];

  const maxSteps =
    candidate.experience.length +
    candidate.experience.reduce((n, e) => n + e.bullets.length, 0) +
    candidate.projects.reduce((n, p) => n + p.bullets.length, 0);

  for (let i = 0; i < maxSteps; i++) {
    if (!(await overflowsOnePage(candidate))) break;
    const step: TrimStep | null = nextTrim(candidate, matchedBulletTexts);
    if (!step) break;
    if (step.kind === 'removeExperienceEntry') removedExperience.push(candidate.experience[step.entryIndex]);
    candidate = applyTrim(candidate, step);
  }

  return { content: candidate, removedExperience };
}
