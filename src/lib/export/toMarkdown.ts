// What this file is: deterministic Markdown renderers for a generated
// resume and cover letter -- no LLM involved, same "convert once, render
// deterministically" spirit as the LaTeX fill pipeline. Mirrors
// templateContext.ts's field selection (same dateRange/formatMonthYear
// helpers, same bullet-less-entry filtering via withRenderableEntries) so
// the Markdown export shows exactly what the on-screen preview shows.
// In plain terms: turns your generated resume/cover letter into a plain
// Markdown file you can download.

import type { CoverLetterContent, Contact, ResumeContent } from '../../types';
import { formatMonthYear } from '../../components/ui/primitives';
import { withRenderableEntries } from '../renderableResume';

function dateRange(start: string, end: string): string {
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} -- ${end}`;
}

function contactLine(contact: Contact): string {
  const parts = [contact.email, contact.phone, contact.location].filter(Boolean);
  const links = contact.links.filter((l) => l.url.trim() !== '').map((l) => `[${l.label || l.url}](${l.url})`);
  return [...parts, ...links].join(' · ');
}

/**
 * Renders a ResumeContent as GitHub-flavored Markdown.
 * In plain terms: builds a .md version of the generated resume.
 */
export function resumeToMarkdown(rawContent: ResumeContent): string {
  const content = withRenderableEntries(rawContent);
  const lines: string[] = [`# ${content.contact.name || 'Resume'}`, '', contactLine(content.contact), ''];

  if (content.skills.length > 0) {
    lines.push('## Skills', '');
    for (const group of content.skills) {
      lines.push(group.category ? `**${group.category}:** ${group.items.join(', ')}` : group.items.join(', '));
    }
    lines.push('');
  }

  if (content.experience.length > 0) {
    lines.push('## Experience', '');
    for (const e of content.experience) {
      const range = dateRange(
        formatMonthYear(e.startMonth, e.startYear),
        e.current ? 'Present' : formatMonthYear(e.endMonth, e.endYear),
      );
      lines.push(`### ${e.title}${e.company ? ` — ${e.company}` : ''}`);
      const meta = [e.location, range].filter(Boolean).join(' · ');
      if (meta) lines.push(`*${meta}*`);
      lines.push('');
      for (const bullet of e.bullets) lines.push(`- ${bullet}`);
      lines.push('');
    }
  }

  if (content.projects.length > 0) {
    lines.push('## Projects', '');
    for (const p of content.projects) {
      lines.push(`### ${p.name}`);
      if (p.description) lines.push(p.description, '');
      for (const bullet of p.bullets) lines.push(`- ${bullet}`);
      const links = p.links.filter((l) => l.url.trim() !== '').map((l) => `[${l.label || l.url}](${l.url})`);
      if (links.length > 0) lines.push('', links.join(' · '));
      lines.push('');
    }
  }

  if (content.education.length > 0) {
    lines.push('## Education', '');
    for (const ed of content.education) {
      const range = dateRange(
        formatMonthYear(ed.startMonth, ed.startYear),
        ed.current ? 'Present' : formatMonthYear(ed.endMonth, ed.endYear),
      );
      lines.push(`### ${ed.school}`);
      const meta = [[ed.degree, ed.field].filter(Boolean).join(', '), range, ed.gpa && `GPA ${ed.gpa}`]
        .filter(Boolean)
        .join(' · ');
      if (meta) lines.push(`*${meta}*`);
      lines.push('');
      for (const detail of ed.details ?? []) lines.push(`- ${detail}`);
      lines.push('');
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Renders a CoverLetterContent as Markdown, with the candidate's contact
 * block as a letterhead (the content itself doesn't repeat the candidate's
 * name/contact, so it's passed in separately).
 * In plain terms: builds a .md version of the generated cover letter.
 */
export function coverLetterToMarkdown(content: CoverLetterContent, contact: Contact): string {
  const lines: string[] = [`# ${contact.name || 'Cover Letter'}`, '', contactLine(contact), '', '---', ''];
  lines.push(content.greeting, '');
  for (const paragraph of content.paragraphs) lines.push(paragraph, '');
  lines.push(content.closing);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
