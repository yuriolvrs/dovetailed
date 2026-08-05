// What this file is: the Generate step's Work Experience list -- accordion
// rows (collapsed to title/company/dates) with ▲/▼ reorder buttons, a
// per-entry "N matched" badge, and per-bullet match labels naming which job
// requirement each bullet satisfies (from the resume's sourceMap, via
// ResumeEditor's bulletMatch lookup). Reuses the same field layout as the
// Profile page's ExperienceForm.
// In plain terms: the job entries in the resume editor, collapsed into rows
// you can reorder and expand one at a time, showing at a glance which
// bullets are tied to a requirement from the job posting.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';
import type { ExperienceEntry } from '../../types';
import { experienceKey } from '../../lib/resumeEntryKeys';
import { StringList } from '../StringList';
import { DateRangeFields } from '../profile/DateRangeFields';
import { ResumeAccordionRow } from './ResumeAccordionRow';
import { BulletPicker } from '../BulletPicker';
import {
  Badge,
  Card,
  Collapsible,
  CollapsibleSectionHeader,
  FieldInput,
  ResetButton,
  fieldLabelClass,
  formatMonthYear,
} from '../ui/primitives';

function newExperienceEntry(): ExperienceEntry {
  return { section: 'Experience', company: '', title: '', current: false, bullets: [] };
}

function entryDates(entry: ExperienceEntry): string {
  const start = formatMonthYear(entry.startMonth, entry.startYear);
  const end = entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear);
  if (!start && !end) return '';
  return `${start || '?'} – ${end || '?'}`;
}

export function ResumeExperienceSection({
  value,
  onChange,
  bulletMatch,
  bulletRewrite,
  profileBulletsFor,
  excludedEntries,
  onAddEntry,
  onFocusBullet,
  onReset,
  navRequest,
}: {
  value: ExperienceEntry[];
  onChange: (experience: ExperienceEntry[]) => void;
  /** Requirement text this bullet is matched to, or null if unmatched. */
  bulletMatch: (bulletText: string) => string | null;
  bulletRewrite: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
  /** All bullets on the matching source profile entry (not just the ones currently included), for the "add back" picker. */
  profileBulletsFor: (entry: ExperienceEntry) => string[];
  /** Profile entries left out of this resume (removed here, or never auto-selected), for the "add back" picker. */
  excludedEntries: ExperienceEntry[];
  onAddEntry: (entry: ExperienceEntry) => void;
  /** Reports a bullet gaining focus (index) or losing it (null), so the live preview can highlight it. */
  onFocusBullet: (entry: ExperienceEntry, bulletIndex: number | null) => void;
  /** Re-imports this section's experience entries from the profile, discarding edits made here. */
  onReset: () => void;
  /** A click on this entry (or one of its bullets) in the live preview, requesting it open and scroll into view. */
  navRequest?: { entryKey: string; bulletIndex?: number; nonce: number } | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(value.length > 0 ? 0 : null);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navRequest) return;
    const index = value.findIndex((entry) => experienceKey(entry) === navRequest.entryKey);
    if (index === -1) return;
    setSectionOpen(true);
    setOpenIndex(index);
    setHighlightIndex(index);
    const highlightTimer = setTimeout(() => setHighlightIndex(null), 1500);
    const scrollTimer = setTimeout(() => {
      const row = containerRef.current?.querySelector(`[data-nav-key="${CSS.escape(navRequest.entryKey)}"]`);
      const bulletTarget =
        navRequest.bulletIndex !== undefined ? row?.querySelector(`[data-index="${navRequest.bulletIndex}"]`) : null;
      (bulletTarget ?? row)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    // Also unconditionally clears the highlight on cleanup -- otherwise
    // when navRequest flips to null/a different entry, this effect reruns,
    // its cleanup cancels the pending "un-highlight" timeout, and the
    // highlight is left stuck on forever.
    return () => {
      clearTimeout(highlightTimer);
      clearTimeout(scrollTimer);
      setHighlightIndex(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  function update(index: number, next: ExperienceEntry) {
    onChange(value.map((entry, i) => (i === index ? next : entry)));
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    setOpenIndex((cur) => {
      if (cur === null) return null;
      if (cur === index) return null;
      return cur > index ? cur - 1 : cur;
    });
  }

  function add() {
    onChange([...value, newExperienceEntry()]);
    setOpenIndex(value.length);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setOpenIndex((cur) => {
      if (cur === index) return target;
      if (cur === target) return index;
      return cur;
    });
  }

  return (
    <Card className="p-6" ref={containerRef}>
      <CollapsibleSectionHeader
        title="Work Experience"
        sub={`${value.length} position${value.length !== 1 ? 's' : ''}`}
        open={sectionOpen}
        onToggle={() => setSectionOpen((o) => !o)}
        onAdd={add}
        extraActions={<ResetButton onReset={onReset} />}
      />
      <Collapsible open={sectionOpen}>
        <>
          {value.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
              No experience entries yet.
            </div>
          )}

          {value.map((entry, index) => {
            const matchedCount = entry.bullets.filter((b) => bulletMatch(b) !== null).length;
            return (
              <ResumeAccordionRow
                key={index}
                open={openIndex === index}
                onToggle={() => setOpenIndex((cur) => (cur === index ? null : index))}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                canMoveUp={index > 0}
                canMoveDown={index < value.length - 1}
                onRemove={() => remove(index)}
                title={
                  <>
                    {entry.title || 'Untitled role'}
                    {entry.company && <span className="font-normal text-slate-400"> · {entry.company}</span>}
                  </>
                }
                subtitle={entryDates(entry)}
                dataNavKey={experienceKey(entry)}
                highlighted={highlightIndex === index}
                badge={
                  matchedCount > 0 ? (
                    <Badge color="green">
                      <Check size={11} />
                      {matchedCount} matched
                    </Badge>
                  ) : (
                    <Badge color="slate">unmatched</Badge>
                  )
                }
              >
                <FieldInput
                  label="Section"
                  placeholder="Experience"
                  value={entry.section ?? ''}
                  onChange={(section) => update(index, { ...entry, section })}
                />

                <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={entry.prunable ?? false}
                    onChange={(e) => update(index, { ...entry, prunable: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Drop this first if the resume runs past one page
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <FieldInput
                    label="Company"
                    placeholder="Stripe"
                    value={entry.company}
                    onChange={(company) => update(index, { ...entry, company })}
                  />
                  <FieldInput
                    label="Job Title"
                    placeholder="Senior Engineer"
                    value={entry.title}
                    onChange={(title) => update(index, { ...entry, title })}
                  />
                </div>

                <DateRangeFields entry={entry} update={(next) => update(index, next)} currentLabel="Currently working here" />

                <FieldInput
                  label="Location"
                  placeholder="San Francisco, CA"
                  value={entry.location ?? ''}
                  onChange={(location) => update(index, { ...entry, location })}
                />

                <div>
                  <span className={`mb-1 block ${fieldLabelClass}`}>Description & Achievements</span>
                  <StringList
                    items={entry.bullets}
                    onChange={(bullets) => update(index, { ...entry, bullets })}
                    placeholder="Describe an accomplishment..."
                    multiline
                    addLabel="Add bullet"
                    emptyLabel="No bullets yet."
                    reorderable
                    itemBadge={(bulletText) => {
                      const requirement = bulletMatch(bulletText);
                      return requirement ? (
                        <Badge color="green">
                          <Check size={11} />
                          Matches: {requirement}
                        </Badge>
                      ) : (
                        <Badge color="amber">Not matched yet</Badge>
                      );
                    }}
                    itemExtra={bulletRewrite}
                    onItemFocus={(bulletIndex) => onFocusBullet(entry, bulletIndex)}
                    onItemBlur={() => onFocusBullet(entry, null)}
                  />
                  <div className="mt-2">
                    <BulletPicker
                      allBullets={profileBulletsFor(entry)}
                      included={entry.bullets}
                      onAdd={(bullet) => update(index, { ...entry, bullets: [...entry.bullets, bullet] })}
                      bulletMatch={bulletMatch}
                    />
                  </div>
                </div>
              </ResumeAccordionRow>
            );
          })}

          {excludedEntries.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Not included</p>
              {excludedEntries.map((entry, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAddEntry(entry)}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  <Plus size={13} className="shrink-0 text-slate-400" />
                  <span className="flex-1 text-sm text-slate-500">
                    {entry.title || 'Untitled role'}
                    {entry.company && <span className="text-slate-400"> · {entry.company}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      </Collapsible>
    </Card>
  );
}
