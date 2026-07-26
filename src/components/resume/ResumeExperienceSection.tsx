// What this file is: the Generate step's Work Experience list -- accordion
// rows (collapsed to title/company/dates) with ▲/▼ reorder buttons, a
// per-entry "N matched" badge, and per-bullet match labels naming which job
// requirement each bullet satisfies (from the resume's sourceMap, via
// ResumeEditor's bulletMatch lookup). Reuses the same field layout as the
// Profile page's ExperienceForm.
// In plain terms: the job entries in the resume editor, collapsed into rows
// you can reorder and expand one at a time, showing at a glance which
// bullets are tied to a requirement from the job posting.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';
import type { ExperienceEntry } from '../../types';
import { StringList } from '../StringList';
import { DateRangeFields } from '../profile/DateRangeFields';
import { ResumeAccordionRow } from './ResumeAccordionRow';
import { Badge, Btn, Card, FieldInput, fieldLabelClass, formatMonthYear } from '../ui/primitives';

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
}: {
  value: ExperienceEntry[];
  onChange: (experience: ExperienceEntry[]) => void;
  /** Requirement text this bullet is matched to, or null if unmatched. */
  bulletMatch: (bulletText: string) => string | null;
  bulletRewrite: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(value.length > 0 ? 0 : null);

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
    <Card className="p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Work Experience</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {value.length} position{value.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Btn size="sm" variant="secondary" onClick={add}>
          <Plus size={13} />
          Add
        </Btn>
      </div>

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
                itemWrapperClassName={(bulletText) =>
                  bulletMatch(bulletText)
                    ? 'border-l-[3px] border-emerald-400 bg-emerald-50/50 rounded-lg pl-3 pr-2 py-2'
                    : 'border-l-[3px] border-amber-300 bg-amber-50/50 rounded-lg pl-3 pr-2 py-2'
                }
                itemBadge={(bulletText) => {
                  const requirement = bulletMatch(bulletText);
                  return requirement ? (
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-semibold text-emerald-700">
                      <Check size={11} />
                      <span>Matches requirement:</span>
                      <Badge color="green">{requirement}</Badge>
                    </div>
                  ) : (
                    <div className="text-[11px] font-semibold text-amber-700">○ Not matched to any requirement yet</div>
                  );
                }}
                itemExtra={bulletRewrite}
              />
            </div>
          </ResumeAccordionRow>
        );
      })}
    </Card>
  );
}
