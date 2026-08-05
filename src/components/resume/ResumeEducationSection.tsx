// What this file is: the Generate step's Education list -- accordion rows
// (collapsed to school/degree/dates) with ▲/▼ reorder buttons, reusing the
// same field layout as the Profile page's EducationForm. The whole section
// can also be collapsed to a header line, like Contact Information, and
// reset back to the profile's education entries via a confirm-then-discard
// Reset button (ResetButton, ui/primitives.tsx).
// In plain terms: the school/degree entries in the resume editor, collapsed
// into rows you can reorder and expand one at a time, inside a section you
// can collapse entirely or reset back to what's in your profile.

import { useEffect, useRef, useState } from 'react';
import type { EducationEntry } from '../../types';
import { educationKey } from '../../lib/resumeEntryKeys';
import { StringList } from '../StringList';
import { DateRangeFields } from '../profile/DateRangeFields';
import { ResumeAccordionRow } from './ResumeAccordionRow';
import {
  Card,
  Collapsible,
  CollapsibleSectionHeader,
  FieldInput,
  ResetButton,
  fieldLabelClass,
  formatMonthYear,
} from '../ui/primitives';

function newEducationEntry(): EducationEntry {
  return { school: '', degree: '', current: false };
}

function entryDates(entry: EducationEntry): string {
  const start = formatMonthYear(entry.startMonth, entry.startYear);
  const end = entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear);
  if (!start && !end) return '';
  return `${start || '?'} – ${end || '?'}`;
}

export function ResumeEducationSection({
  value,
  onChange,
  onReset,
  navRequest,
}: {
  value: EducationEntry[];
  onChange: (education: EducationEntry[]) => void;
  /** Re-imports this section's education entries from the profile, discarding edits made here. */
  onReset: () => void;
  /** A click on this entry in the live preview, requesting it open and scroll into view. */
  navRequest?: { entryKey: string; nonce: number } | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(value.length > 0 ? 0 : null);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!navRequest) return;
    const index = value.findIndex((entry) => educationKey(entry) === navRequest.entryKey);
    if (index === -1) return;
    setSectionOpen(true);
    setOpenIndex(index);
    setHighlightIndex(index);
    const highlightTimer = setTimeout(() => setHighlightIndex(null), 1500);
    const scrollTimer = setTimeout(() => {
      containerRef.current
        ?.querySelector(`[data-nav-key="${CSS.escape(navRequest.entryKey)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

  function update(index: number, next: EducationEntry) {
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
    onChange([...value, newEducationEntry()]);
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
        title="Education"
        sub={`${value.length} entr${value.length !== 1 ? 'ies' : 'y'}`}
        open={sectionOpen}
        onToggle={() => setSectionOpen((o) => !o)}
        onAdd={add}
        extraActions={<ResetButton onReset={onReset} />}
      />
      <Collapsible open={sectionOpen}>
        <>
          {value.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
              No education entries yet.
            </div>
          )}

          {value.map((entry, index) => (
            <ResumeAccordionRow
              key={index}
              open={openIndex === index}
              onToggle={() => setOpenIndex((cur) => (cur === index ? null : index))}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              canMoveUp={index > 0}
              canMoveDown={index < value.length - 1}
              onRemove={() => remove(index)}
              title={entry.school || 'Untitled school'}
              subtitle={[entry.degree, entryDates(entry)].filter(Boolean).join(' · ')}
              dataNavKey={educationKey(entry)}
              highlighted={highlightIndex === index}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <FieldInput
                    label="Institution"
                    placeholder="UC Berkeley"
                    value={entry.school}
                    onChange={(school) => update(index, { ...entry, school })}
                  />
                </div>
                <FieldInput
                  label="Degree"
                  placeholder="B.S."
                  value={entry.degree}
                  onChange={(degree) => update(index, { ...entry, degree })}
                />
                <FieldInput
                  label="Field of Study"
                  placeholder="Computer Science"
                  value={entry.field ?? ''}
                  onChange={(field) => update(index, { ...entry, field })}
                />
              </div>

              <DateRangeFields
                entry={entry}
                update={(next) => update(index, next)}
                currentLabel="Currently studying here"
              />

              <FieldInput
                label="GPA"
                placeholder="3.8"
                value={entry.gpa ?? ''}
                onChange={(gpa) => update(index, { ...entry, gpa })}
                className="max-w-[140px]"
              />

              <div>
                <span className={`mb-1 block ${fieldLabelClass}`}>Details</span>
                <StringList
                  items={entry.details ?? []}
                  onChange={(details) => update(index, { ...entry, details })}
                  placeholder="e.g. Dean's List, relevant coursework..."
                  addLabel="Add detail"
                  emptyLabel="No details yet."
                />
              </div>
            </ResumeAccordionRow>
          ))}
        </>
      </Collapsible>
    </Card>
  );
}
