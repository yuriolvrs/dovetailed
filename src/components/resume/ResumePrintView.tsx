// What this file is: the print/export layout for a ResumeContent. Rendered
// twice on the Generate page: once as the actual print target (`variant`
// defaults to 'print' -- always in the DOM but hidden on screen via `hidden
// print:block`, so `window.print()` prints only this, not the editor
// chrome), and once as a visible, non-interactive live preview next to the
// editor (`variant="preview"` -- shown on screen, hidden from print so it
// doesn't produce a duplicate page). Same content-rendering logic either
// way; only the wrapping chrome differs. No PDF library involved; the
// browser's own print-to-PDF does the rendering, same as the PRD's "no new
// dependency needed" default HTML path.
// In plain terms: the plain, print-friendly layout of your resume -- shown
// live as a preview while editing, and used as-is when you print or "Save
// as PDF."

import type { ExperienceEntry, ResumeContent } from '../../types';
import { formatMonthYear } from '../ui/primitives';

function dateRange(start: string, end: string): string {
  if (!start && !end) return '';
  return `${start} -- ${end}`;
}

const DEFAULT_EXPERIENCE_SECTION = 'Experience';

// Groups experience entries by their user-defined `section` (e.g. "Work
// Experience" vs. "Extra-Curricular Activities"), in first-appearance order,
// so the printed resume gets one heading per group instead of a single
// hardcoded "Experience" heading. Entries with no section (or old profiles
// saved before this field existed) fall into one default group.
// In plain terms: splits your experience list into the labeled groups you
// set up, for separate headings on the printed resume.
function groupBySection(entries: ExperienceEntry[]): { section: string; entries: ExperienceEntry[] }[] {
  const groups: { section: string; entries: ExperienceEntry[] }[] = [];
  const indexBySection = new Map<string, number>();

  for (const entry of entries) {
    const section = entry.section?.trim() || DEFAULT_EXPERIENCE_SECTION;
    let index = indexBySection.get(section);
    if (index === undefined) {
      index = groups.length;
      indexBySection.set(section, index);
      groups.push({ section, entries: [] });
    }
    groups[index].entries.push(entry);
  }

  return groups;
}

export function ResumePrintView({
  content,
  variant = 'print',
}: {
  content: ResumeContent;
  /** 'print': hidden on screen, the actual print target. 'preview': visible live preview, excluded from print output. */
  variant?: 'print' | 'preview';
}) {
  const rootClass =
    variant === 'print'
      ? 'hidden print:block text-slate-900 text-[11px] leading-snug font-sans'
      : 'print:hidden text-slate-900 text-[11px] leading-snug font-sans bg-white rounded-2xl border border-slate-200 shadow-[0_1px_4px_rgba(15,23,42,0.06)] p-8';

  return (
    <div className={rootClass}>
      {variant === 'print' && <style>{'@page { size: letter; margin: 0.55in; }'}</style>}

      <div className="text-center mb-3">
        <p className="text-2xl font-bold tracking-wide">{content.contact.name}</p>
        <p className="text-[10px] mt-1">
          {[
            content.contact.phone,
            content.contact.email,
            content.contact.location,
            ...content.contact.links.map((l) => l.url),
          ]
            .filter(Boolean)
            .join(' | ')}
        </p>
      </div>

      {content.summary.trim() !== '' && (
        <section className="mb-3">
          <p>{content.summary}</p>
        </section>
      )}

      {content.education.length > 0 && (
        <section className="mb-3">
          <p className="text-xs font-bold uppercase border-b border-slate-900 mb-1.5">Education</p>
          {content.education.map((entry, i) => (
            <div key={i} className="flex justify-between mb-1">
              <div>
                <p className="font-bold">{entry.school}</p>
                <p className="italic">
                  {entry.degree}
                  {entry.field ? `, ${entry.field}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p></p>
                <p className="italic">
                  {dateRange(
                    formatMonthYear(entry.startMonth, entry.startYear),
                    entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear),
                  )}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      {groupBySection(content.experience).map(({ section, entries }) => (
        <section key={section} className="mb-3">
          <p className="text-xs font-bold uppercase border-b border-slate-900 mb-1.5">{section}</p>
          {entries.map((entry, i) => (
            <div key={i} className="mb-2">
              <div className="flex justify-between">
                <p className="font-bold">{entry.title}</p>
                <p className="italic">
                  {dateRange(
                    formatMonthYear(entry.startMonth, entry.startYear),
                    entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear),
                  )}
                </p>
              </div>
              <div className="flex justify-between italic">
                <p>{entry.company}</p>
                <p>{entry.location}</p>
              </div>
              {entry.bullets.length > 0 && (
                <ul className="list-disc ml-4 mt-0.5">
                  {entry.bullets.map((bullet, j) => (
                    <li key={j}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}

      {content.projects.length > 0 && (
        <section className="mb-3">
          <p className="text-xs font-bold uppercase border-b border-slate-900 mb-1.5">Projects</p>
          {content.projects.map((entry, i) => (
            <div key={i} className="mb-2">
              <p>
                <span className="font-bold">{entry.name}</span>
                {entry.description ? <span className="italic"> | {entry.description}</span> : null}
              </p>
              {entry.bullets.length > 0 && (
                <ul className="list-disc ml-4 mt-0.5">
                  {entry.bullets.map((bullet, j) => (
                    <li key={j}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {content.skills.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase border-b border-slate-900 mb-1.5">Technical Skills</p>
          {content.skills.map((group, i) => (
            <p key={i}>
              {group.category && <span className="font-bold">{group.category}: </span>}
              {group.items.join(', ')}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
