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
// On the 'preview' variant, every field is also clickable (contact block,
// each education/experience/project entry, each bullet, each skills group)
// -- clicking calls onNavigate with a ResumeNavTarget, which GeneratePage
// uses to scroll the editor to and open that same field.
// In plain terms: the plain, print-friendly layout of your resume -- shown
// live as a preview while editing (click anything in it to jump to that
// field in the editor), and used as-is when you print or "Save as PDF."

import { useEffect, useRef } from 'react';
import type { ExperienceEntry, ResumeContent } from '../../types';
import { educationKey, experienceKey, projectKey, type ResumeFocusTarget, type ResumeNavTarget } from '../../lib/resumeEntryKeys';
import { formatMonthYear } from '../ui/primitives';

// Shared styling for a clickable preview region -- only applied on the
// 'preview' variant (the print/measure variants render the exact same
// content non-interactively).
const navClickableClass = 'cursor-pointer rounded transition-colors hover:bg-slate-50 -mx-1 px-1';

// Data-attribute value identifying one bullet's spot in the preview, so a
// focused editor field (see ResumeEditor's onFocusBullet) can be found and
// highlighted/scrolled to without keeping refs for every bullet.
function bulletFocusKey(target: ResumeFocusTarget): string {
  return `${target.section}:${target.entryKey}:${target.bulletIndex}`;
}

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
  focusedTarget = null,
  onNavigate,
}: {
  content: ResumeContent;
  /**
   * 'print': hidden on screen, the actual print target.
   * 'preview': visible live preview, excluded from print output.
   * 'measure': same unpadded layout as 'print' but without the `hidden`
   * class, so it actually lays out (off-screen) for height measurement --
   * see fitToOnePage.ts.
   */
  variant?: 'print' | 'preview' | 'measure';
  /** The bullet currently focused in the editor, if any -- highlighted here on the 'preview' variant. */
  focusedTarget?: ResumeFocusTarget | null;
  /** Fired when a field is clicked on the 'preview' variant, so the editor can scroll to and open the matching field. */
  onNavigate?: (target: ResumeNavTarget) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusedTarget || variant !== 'preview' || !rootRef.current) return;
    const el = rootRef.current.querySelector(`[data-focus-key="${bulletFocusKey(focusedTarget)}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedTarget, variant]);

  const rootClass =
    variant === 'preview'
      ? 'print:hidden text-slate-900 text-[15px] leading-snug font-sans bg-white rounded-2xl border border-slate-200 shadow-[0_1px_4px_rgba(15,23,42,0.06)] p-8'
      : variant === 'measure'
        ? 'text-slate-900 text-[15px] leading-snug font-sans'
        : 'hidden print:block text-slate-900 text-[15px] leading-snug font-sans';

  return (
    <div ref={rootRef} className={rootClass}>
      {variant === 'print' && <style>{'@page { size: letter; margin: 0.55in; }'}</style>}

      <div
        className={`text-center mb-3 ${variant === 'preview' && onNavigate ? navClickableClass : ''}`}
        onClick={variant === 'preview' ? () => onNavigate?.({ section: 'contact' }) : undefined}
      >
        <p className="text-[18px] font-bold tracking-wide">{content.contact.name}</p>
        <p className="text-[15px] mt-1">
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

      {content.education.length > 0 && (
        <section className="mb-3">
          <p className="text-[15px] font-bold uppercase border-b border-slate-900 mb-1.5">Education</p>
          {content.education.map((entry, i) => (
            <div
              key={i}
              className={`mb-1 ${variant === 'preview' && onNavigate ? navClickableClass : ''}`}
              onClick={variant === 'preview' ? () => onNavigate?.({ section: 'education', entryKey: educationKey(entry) }) : undefined}
            >
              <div className="flex justify-between">
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
                  {entry.gpa && <p className="italic">{entry.gpa} GPA</p>}
                </div>
              </div>
              {entry.details && entry.details.length > 0 && (
                <ul className="list-disc ml-4 mt-0.5">
                  {entry.details.map((detail, j) => (
                    <li key={j}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {groupBySection(content.experience).map(({ section, entries }) => (
        <section key={section} className="mb-3">
          <p className="text-[15px] font-bold uppercase border-b border-slate-900 mb-1.5">{section}</p>
          {entries.map((entry, i) => (
            <div
              key={i}
              className={`mb-2 ${variant === 'preview' && onNavigate ? navClickableClass : ''}`}
              onClick={
                variant === 'preview' ? () => onNavigate?.({ section: 'experience', entryKey: experienceKey(entry) }) : undefined
              }
            >
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
                  {entry.bullets.map((bullet, j) => {
                    const target: ResumeFocusTarget = { section: 'experience', entryKey: experienceKey(entry), bulletIndex: j };
                    const focused = variant === 'preview' && focusedTarget && bulletFocusKey(focusedTarget) === bulletFocusKey(target);
                    return (
                      <li
                        key={j}
                        data-focus-key={bulletFocusKey(target)}
                        onClick={
                          variant === 'preview'
                            ? (e) => {
                                e.stopPropagation();
                                onNavigate?.({ section: 'experience', entryKey: experienceKey(entry), bulletIndex: j });
                              }
                            : undefined
                        }
                        className={[
                          focused ? 'bg-emerald-100' : '',
                          variant === 'preview' && onNavigate ? navClickableClass : 'transition-colors',
                        ].join(' ')}
                      >
                        {bullet}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}

      {content.projects.length > 0 && (
        <section className="mb-3">
          <p className="text-[15px] font-bold uppercase border-b border-slate-900 mb-1.5">Projects</p>
          {content.projects.map((entry, i) => (
            <div
              key={i}
              className={`mb-2 ${variant === 'preview' && onNavigate ? navClickableClass : ''}`}
              onClick={variant === 'preview' ? () => onNavigate?.({ section: 'project', entryKey: projectKey(entry) }) : undefined}
            >
              <p>
                <span className="font-bold">{entry.name}</span>
                {entry.description ? <span className="italic"> | {entry.description}</span> : null}
              </p>
              {entry.bullets.length > 0 && (
                <ul className="list-disc ml-4 mt-0.5">
                  {entry.bullets.map((bullet, j) => {
                    const target: ResumeFocusTarget = { section: 'project', entryKey: projectKey(entry), bulletIndex: j };
                    const focused = variant === 'preview' && focusedTarget && bulletFocusKey(focusedTarget) === bulletFocusKey(target);
                    return (
                      <li
                        key={j}
                        data-focus-key={bulletFocusKey(target)}
                        onClick={
                          variant === 'preview'
                            ? (e) => {
                                e.stopPropagation();
                                onNavigate?.({ section: 'project', entryKey: projectKey(entry), bulletIndex: j });
                              }
                            : undefined
                        }
                        className={[
                          focused ? 'bg-emerald-100' : '',
                          variant === 'preview' && onNavigate ? navClickableClass : 'transition-colors',
                        ].join(' ')}
                      >
                        {bullet}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {content.skills.length > 0 && (
        <section>
          <p className="text-[15px] font-bold uppercase border-b border-slate-900 mb-1.5">Skills</p>
          {content.skills.map((group, i) => (
            <p
              key={i}
              className={variant === 'preview' && onNavigate ? navClickableClass : ''}
              onClick={variant === 'preview' ? () => onNavigate?.({ section: 'skills', groupIndex: i }) : undefined}
            >
              {group.category && <span className="font-bold">{group.category}: </span>}
              {group.items.join(', ')}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
