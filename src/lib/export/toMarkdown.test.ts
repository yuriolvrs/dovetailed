import { describe, expect, it } from 'vitest';
import type { CoverLetterContent, ResumeContent } from '../../types';
import { coverLetterToMarkdown, resumeToMarkdown } from './toMarkdown';

function baseResume(): ResumeContent {
  return {
    contact: { name: 'Jane Doe', email: 'jane@example.com', phone: '555-1234', location: 'Remote', links: [{ label: 'GitHub', url: 'https://github.com/jane' }] },
    skills: [{ category: 'Languages', items: ['TypeScript', 'Python'] }],
    experience: [
      {
        title: 'Senior Engineer',
        company: 'Acme',
        startMonth: 'January',
        startYear: '2022',
        current: true,
        bullets: ['Shipped the thing', 'Fixed the other thing'],
      },
    ],
    projects: [{ name: 'OpenResume', description: 'A resume tool', bullets: ['Built it'], links: [] }],
    education: [{ school: 'UC Berkeley', degree: 'B.S.', field: 'CS', current: false, gpa: '3.8' }],
  };
}

describe('resumeToMarkdown', () => {
  it('includes name, contact line, and every section heading', () => {
    const md = resumeToMarkdown(baseResume());
    expect(md).toContain('# Jane Doe');
    expect(md).toContain('jane@example.com');
    expect(md).toContain('## Skills');
    expect(md).toContain('## Experience');
    expect(md).toContain('## Projects');
    expect(md).toContain('## Education');
    expect(md).toContain('- Shipped the thing');
    expect(md).toContain('Senior Engineer — Acme');
    expect(md).toContain('January 2022 -- Present');
  });

  it('omits a bullet-less experience/project entry, matching the on-screen preview', () => {
    const content = baseResume();
    content.experience.push({ title: 'Empty Role', company: 'Nowhere', current: false, bullets: [] });
    const md = resumeToMarkdown(content);
    expect(md).not.toContain('Empty Role');
  });

  it('omits empty sections entirely', () => {
    const content = baseResume();
    content.projects = [];
    const md = resumeToMarkdown(content);
    expect(md).not.toContain('## Projects');
  });
});

describe('coverLetterToMarkdown', () => {
  it('renders the letterhead, greeting, paragraphs, and closing', () => {
    const content: CoverLetterContent = {
      greeting: 'Dear Hiring Manager,',
      paragraphs: ['First paragraph.', 'Second paragraph.'],
      closing: 'Sincerely, Jane',
    };
    const md = coverLetterToMarkdown(content, baseResume().contact);
    expect(md).toContain('# Jane Doe');
    expect(md).toContain('Dear Hiring Manager,');
    expect(md).toContain('First paragraph.');
    expect(md).toContain('Second paragraph.');
    expect(md).toContain('Sincerely, Jane');
  });
});
