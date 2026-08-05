// What this file is: the Generate step's Education list -- accordion rows
// (collapsed to school/degree/dates) with ▲/▼ reorder buttons, reusing the
// same field layout as the Profile page's EducationForm.
// In plain terms: the school/degree entries in the resume editor, collapsed
// into rows you can reorder and expand one at a time.

import { useState } from 'react';
import type { EducationEntry } from '../../types';
import { StringList } from '../StringList';
import { DateRangeFields } from '../profile/DateRangeFields';
import { ResumeAccordionRow } from './ResumeAccordionRow';
import { Card, FieldInput, fieldLabelClass, formatMonthYear } from '../ui/primitives';
import { Btn } from '../ui/primitives';
import { Plus } from 'lucide-react';

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
}: {
  value: EducationEntry[];
  onChange: (education: EducationEntry[]) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(value.length > 0 ? 0 : null);

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
    <Card className="p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Education</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {value.length} entr{value.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <Btn size="sm" variant="secondary" onClick={add}>
          <Plus size={13} />
          Add
        </Btn>
      </div>

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
    </Card>
  );
}
