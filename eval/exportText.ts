// What this file is: turns a generated resume and cover letter into plain text in one fixed,
// neutral layout, and strips the "(TEST PROFILE - FICTIONAL)" marker from names.
// In plain terms: makes every document look the same on paper, so a blind judge cannot tell
// which version or tool wrote it.

import type { CoverLetterContent, ResumeContent } from '../src/types';

/**
 * Removes the "(TEST PROFILE - FICTIONAL)" style marker (any parenthesis starting with
 * "TEST PROFILE") from a text. Used for the export only.
 */
export function stripTestMarker(text: string): string {
  return text.replace(/\s*\(\s*TEST PROFILE[^)]*\)/gi, '');
}

function dateRange(e: {
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  current: boolean;
}): string {
  const start = [e.startMonth, e.startYear].filter(Boolean).join(' ');
  const end = e.current ? 'Present' : [e.endMonth, e.endYear].filter(Boolean).join(' ');
  return [start, end].filter(Boolean).join(' - ');
}

/**
 * Renders resume content as plain text in a fixed section order: name, contact line, summary,
 * experience, projects, skills, education.
 * In plain terms: the resume as simple text, always laid out the same way.
 */
export function resumeToText(content: ResumeContent): string {
  const c = content.contact;
  const lines: string[] = [c.name, [c.location, c.email, c.phone].filter(Boolean).join(' | ')];
  if (content.summary?.trim()) lines.push('', 'SUMMARY', content.summary.trim());

  if (content.experience.length > 0) {
    lines.push('', 'EXPERIENCE');
    for (const e of content.experience) {
      lines.push('', e.title, [e.company, e.location, dateRange(e)].filter(Boolean).join(' | '));
      for (const b of e.bullets) lines.push(`- ${b}`);
    }
  }
  if (content.projects.length > 0) {
    lines.push('', 'PROJECTS');
    for (const p of content.projects) {
      lines.push('', [p.name, p.description].filter(Boolean).join(' | '));
      for (const b of p.bullets) lines.push(`- ${b}`);
    }
  }
  if (content.skills.length > 0) {
    lines.push('', 'SKILLS');
    for (const g of content.skills) lines.push(g.category ? `${g.category}: ${g.items.join(', ')}` : g.items.join(', '));
  }
  if (content.education.length > 0) {
    lines.push('', 'EDUCATION');
    for (const e of content.education) {
      lines.push([e.degree, e.field, e.school, dateRange(e), e.gpa ? `GPA ${e.gpa}` : ''].filter(Boolean).join(' | '));
      for (const d of e.details ?? []) lines.push(`- ${d}`);
    }
  }
  return stripTestMarker(lines.join('\n')).trim() + '\n';
}

/**
 * Renders a cover letter as plain text: greeting, paragraphs, closing, then the name.
 * No date line, no address block.
 * In plain terms: the letter as simple text.
 */
export function letterToText(content: CoverLetterContent, candidateName: string): string {
  const parts = [content.greeting, ...content.paragraphs, content.closing, candidateName];
  return stripTestMarker(parts.join('\n\n')).trim() + '\n';
}

/**
 * One blind-judging file: the resume, a divider, then the letter.
 * In plain terms: the whole application package in one plain file.
 */
export function stackText(resume: ResumeContent, letter: CoverLetterContent): string {
  return [
    '=== RESUME ===',
    '',
    resumeToText(resume),
    '=== COVER LETTER ===',
    '',
    letterToText(letter, resume.contact.name),
  ].join('\n');
}
