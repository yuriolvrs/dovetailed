// What this file is: unit tests for buildLatexContext's summary and
// duplicate-location handling, and that {{summary}} is a valid placeholder.
// In plain terms: proves the LaTeX fields for the summary and job location
// come out right.

import { describe, expect, it } from 'vitest';
import type { ResumeContent } from '../../types';
import { buildLatexContext } from './templateContext';
import { validateTemplate } from './validateTemplate';

function resume(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    contact: { name: 'Jane', email: 'j@x.com', links: [] },
    skills: [],
    experience: [
      { company: 'Riverbend Hospital, Vancouver, WA', title: 'RN', location: 'Vancouver, WA', current: true, bullets: ['Did care'] },
    ],
    projects: [],
    education: [],
    ...overrides,
  };
}

describe('buildLatexContext', () => {
  it('exposes the summary, and an empty string when missing', () => {
    expect(buildLatexContext(resume({ summary: 'Nurse.' })).summary).toBe('Nurse.');
    expect(buildLatexContext(resume()).summary).toBe('');
  });

  it('blanks a job location the company text already contains', () => {
    const experience = buildLatexContext(resume()).experience as { location: string }[];
    expect(experience[0].location).toBe('');
  });

  it('accepts {{summary}} as a placeholder', () => {
    const template = String.raw`\documentclass{article}
\begin{document}
{{summary}}
\end{document}`;
    expect(validateTemplate(template).join('\n')).not.toContain('summary');
  });
});
