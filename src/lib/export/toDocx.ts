// What this file is: deterministic DOCX renderers for a generated resume
// and cover letter, built with the `docx` library's document-object API (no
// LLM involved -- same "convert once, render deterministically" spirit as
// the LaTeX/Markdown exports). Field selection mirrors templateContext.ts
// and toMarkdown.ts, so all three exports show the same content.
// In plain terms: turns your generated resume/cover letter into a
// downloadable Word (.docx) file.

import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TextRun,
  type ISectionOptions,
} from 'docx';
import type { CoverLetterContent, Contact, ResumeContent } from '../../types';
import { formatMonthYear } from '../../components/ui/primitives';
import { withRenderableEntries } from '../renderableResume';

function dateRange(start: string, end: string): string {
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} -- ${end}`;
}

const HEADING_SPACING = { before: 240, after: 80 };
const ENTRY_SPACING = { before: 160, after: 40 };

function nameHeading(name: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: name || 'Resume', bold: true, size: 32 })],
    spacing: { after: 60 },
  });
}

function contactParagraph(contact: Contact): Paragraph {
  const parts = [contact.email, contact.phone, contact.location].filter(Boolean) as string[];
  const children: (TextRun | ExternalHyperlink)[] = [];
  parts.forEach((part, i) => {
    if (i > 0) children.push(new TextRun({ text: ' · ', size: 20 }));
    children.push(new TextRun({ text: part, size: 20 }));
  });
  for (const link of contact.links.filter((l) => l.url.trim() !== '')) {
    if (children.length > 0) children.push(new TextRun({ text: ' · ', size: 20 }));
    children.push(
      new ExternalHyperlink({
        link: link.url,
        children: [new TextRun({ text: link.label || link.url, size: 20, style: 'Hyperlink' })],
      }),
    );
  }
  return new Paragraph({ children, spacing: { after: 200 } });
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22 })],
    spacing: HEADING_SPACING,
    border: { bottom: { color: '999999', space: 2, style: 'single', size: 4 } },
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 40 } });
}

/**
 * Renders a ResumeContent as a .docx Blob.
 * In plain terms: builds a Word version of the generated resume.
 */
export async function resumeToDocx(rawContent: ResumeContent): Promise<Blob> {
  const content = withRenderableEntries(rawContent);
  const children: Paragraph[] = [nameHeading(content.contact.name), contactParagraph(content.contact)];

  if (content.skills.length > 0) {
    children.push(sectionHeading('Skills'));
    for (const group of content.skills) {
      children.push(
        new Paragraph({
          children: [
            ...(group.category ? [new TextRun({ text: `${group.category}: `, bold: true, size: 20 })] : []),
            new TextRun({ text: group.items.join(', '), size: 20 }),
          ],
          spacing: { after: 60 },
        }),
      );
    }
  }

  if (content.experience.length > 0) {
    children.push(sectionHeading('Experience'));
    for (const e of content.experience) {
      const range = dateRange(
        formatMonthYear(e.startMonth, e.startYear),
        e.current ? 'Present' : formatMonthYear(e.endMonth, e.endYear),
      );
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${e.title}${e.company ? ` — ${e.company}` : ''}`, bold: true, size: 21 })],
          spacing: ENTRY_SPACING,
        }),
      );
      const meta = [e.location, range].filter(Boolean).join(' · ');
      if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, italics: true, size: 19 })] }));
      for (const bullet of e.bullets) children.push(bulletParagraph(bullet));
    }
  }

  if (content.projects.length > 0) {
    children.push(sectionHeading('Projects'));
    for (const p of content.projects) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: p.name, bold: true, size: 21 })], spacing: ENTRY_SPACING }),
      );
      if (p.description) children.push(new Paragraph({ text: p.description, spacing: { after: 40 } }));
      for (const bullet of p.bullets) children.push(bulletParagraph(bullet));
    }
  }

  if (content.education.length > 0) {
    children.push(sectionHeading('Education'));
    for (const ed of content.education) {
      const range = dateRange(
        formatMonthYear(ed.startMonth, ed.startYear),
        ed.current ? 'Present' : formatMonthYear(ed.endMonth, ed.endYear),
      );
      children.push(
        new Paragraph({ children: [new TextRun({ text: ed.school, bold: true, size: 21 })], spacing: ENTRY_SPACING }),
      );
      const meta = [[ed.degree, ed.field].filter(Boolean).join(', '), range, ed.gpa && `GPA ${ed.gpa}`]
        .filter(Boolean)
        .join(' · ');
      if (meta) children.push(new Paragraph({ children: [new TextRun({ text: meta, italics: true, size: 19 })] }));
      for (const detail of ed.details ?? []) children.push(bulletParagraph(detail));
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children } satisfies ISectionOptions] });
  return Packer.toBlob(doc);
}

/**
 * Renders a CoverLetterContent as a .docx Blob, with the candidate's contact
 * block as a letterhead (passed in separately since the content itself
 * doesn't repeat the candidate's name/contact).
 * In plain terms: builds a Word version of the generated cover letter.
 */
export async function coverLetterToDocx(content: CoverLetterContent, contact: Contact): Promise<Blob> {
  const children: Paragraph[] = [
    nameHeading(contact.name),
    contactParagraph(contact),
    new Paragraph({ text: content.greeting, spacing: { after: 200 } }),
    ...content.paragraphs.map((p) => new Paragraph({ text: p, spacing: { after: 200 }, alignment: AlignmentType.LEFT })),
    new Paragraph({ text: content.closing }),
  ];
  const doc = new Document({ sections: [{ properties: {}, children } satisfies ISectionOptions] });
  return Packer.toBlob(doc);
}
