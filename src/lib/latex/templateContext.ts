// What this file is: converts a ResumeContent into the plain-object shape
// the LaTeX fill engine (fillTemplate.ts) walks by dot-path/each-loop --
// the one place that decides which field names are available to a
// placeholder template (e.g. {{name}}, {{#each experience}}...{{/each}}).
// Also computes small derived fields (dateRange, itemsLine) that a raw
// ResumeContent doesn't carry directly, so the template layer never has to.
// In plain terms: reshapes your resume data into simple named fields a
// LaTeX template's placeholders can pull from.

import type { ResumeContent } from '../../types';
import { formatMonthYear } from '../../components/ui/primitives';

function dateRange(start: string, end: string): string {
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} -- ${end}`;
}

/**
 * Builds the plain-object context passed to fillLatexTemplate. Every field
 * here is a candidate placeholder path a converted template may reference.
 * In plain terms: the full list of fields (name, email, each job, each
 * bullet, ...) a LaTeX template can fill in from your resume.
 */
export function buildLatexContext(content: ResumeContent): Record<string, unknown> {
  return {
    name: content.contact.name,
    email: content.contact.email,
    phone: content.contact.phone ?? '',
    location: content.contact.location ?? '',
    links: content.contact.links.map((l) => ({ label: l.label, url: l.url })),
    education: content.education.map((e) => ({
      school: e.school,
      degree: e.degree,
      field: e.field ?? '',
      dateRange: dateRange(
        formatMonthYear(e.startMonth, e.startYear),
        e.current ? 'Present' : formatMonthYear(e.endMonth, e.endYear),
      ),
      gpa: e.gpa ?? '',
      details: e.details ?? [],
    })),
    experience: content.experience.map((e) => ({
      title: e.title,
      company: e.company,
      location: e.location ?? '',
      dateRange: dateRange(
        formatMonthYear(e.startMonth, e.startYear),
        e.current ? 'Present' : formatMonthYear(e.endMonth, e.endYear),
      ),
      bullets: e.bullets,
    })),
    projects: content.projects.map((p) => ({
      name: p.name,
      description: p.description,
      bullets: p.bullets,
      links: p.links.map((l) => ({ label: l.label, url: l.url })),
    })),
    skillGroups: content.skills.map((g) => ({
      category: g.category,
      items: g.items,
      itemsLine: g.items.join(', '),
    })),
  };
}
