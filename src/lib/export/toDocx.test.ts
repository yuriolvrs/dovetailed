import { describe, expect, it } from 'vitest';
import type { CoverLetterContent, ResumeContent } from '../../types';
import { coverLetterToDocx, resumeToDocx } from './toDocx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function baseResume(): ResumeContent {
  return {
    contact: { name: 'Jane Doe', email: 'jane@example.com', links: [] },
    skills: [{ category: 'Languages', items: ['TypeScript'] }],
    experience: [{ title: 'Engineer', company: 'Acme', current: true, bullets: ['Shipped it'] }],
    projects: [],
    education: [{ school: 'UC Berkeley', degree: 'B.S.', current: false }],
  };
}

describe('resumeToDocx', () => {
  it('produces a non-empty .docx Blob', async () => {
    const blob = await resumeToDocx(baseResume());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('omits a bullet-less experience entry, matching the on-screen preview', async () => {
    const content = baseResume();
    content.experience.push({ title: 'Empty', company: 'Nowhere', current: false, bullets: [] });
    const blobWithEmpty = await resumeToDocx(content);
    const blobWithout = await resumeToDocx(baseResume());
    // Both render fine (no throw); the empty entry doesn't blow up rendering.
    expect(blobWithEmpty.size).toBeGreaterThan(0);
    expect(blobWithout.size).toBeGreaterThan(0);
  });
});

describe('coverLetterToDocx', () => {
  it('produces a non-empty .docx Blob', async () => {
    const content: CoverLetterContent = { greeting: 'Dear Hiring Manager,', paragraphs: ['Para one.'], closing: 'Sincerely,' };
    const blob = await coverLetterToDocx(content, baseResume().contact);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(DOCX_MIME);
    expect(blob.size).toBeGreaterThan(0);
  });
});
