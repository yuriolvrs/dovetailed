// What this file is: the Experience editor's right pane -- everything about
// the one position selected in the rail: its title/company headline, the
// dates/location/section/trimming fields, and its list of highlights. Built
// from the shared EntryDetailFrame pieces, so Education and Projects render
// the same pane shape with their own fields.
// In plain terms: the form for the job you picked in the sidebar.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ExperienceEntry } from '../../types';
import { isPrunable } from '../../lib/generation/fitToPage';
import { StringList } from '../StringList';
import { DateRangeCompact } from './DateRangeFields';
import {
  EntryDetailField,
  EntryDetailFields,
  EntryDetailHeader,
  EntryDetailListHeader,
} from './EntryDetailFrame';
import { FieldInput, fieldInputClass } from '../ui/primitives';

const NEW_SECTION_OPTION = '__new__';

export function ExperienceDetail({
  entry,
  onChange,
  onSectionChange,
  onDuplicate,
  onDelete,
  sections,
  bulletBadge,
  bulletRewrite,
}: {
  entry: ExperienceEntry;
  onChange: (next: ExperienceEntry) => void;
  /** Section changes move the entry within the list, so they go through the parent rather than onChange. */
  onSectionChange: (label: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Section headings that already exist, offered in the picker. */
  sections: string[];
  bulletBadge?: (bulletText: string) => ReactNode;
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
}) {
  const [namingSection, setNamingSection] = useState(false);
  const currentSection = entry.section?.trim() || sections[0] || 'Experience';

  return (
    <div className="flex flex-col">
      <EntryDetailHeader
        title={entry.title}
        titlePlaceholder="Job title"
        onTitleChange={(title) => onChange({ ...entry, title })}
        subtitle={entry.company}
        subtitlePlaceholder="Company"
        onSubtitleChange={(company) => onChange({ ...entry, company })}
        noun="position"
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />

      <EntryDetailFields>
        <EntryDetailField label="Dates">
          <DateRangeCompact entry={entry} update={onChange} currentLabel="Still here" />
        </EntryDetailField>

        <FieldInput
          label="Location"
          placeholder="San Francisco, CA"
          value={entry.location ?? ''}
          onChange={(location) => onChange({ ...entry, location })}
        />

        <EntryDetailField label="Section">
          {namingSection ? (
            <input
              autoFocus
              defaultValue=""
              placeholder="Section name, then Enter"
              aria-label="New section name"
              onBlur={() => setNamingSection(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNamingSection(false);
                if (e.key !== 'Enter') return;
                const label = e.currentTarget.value.trim();
                if (label) onSectionChange(label);
                setNamingSection(false);
              }}
              className={`w-full ${fieldInputClass}`}
            />
          ) : (
            <select
              value={currentSection}
              aria-label="Section"
              onChange={(e) => {
                if (e.target.value === NEW_SECTION_OPTION) setNamingSection(true);
                else onSectionChange(e.target.value);
              }}
              className={`w-full ${fieldInputClass}`}
            >
              {(sections.includes(currentSection) ? sections : [currentSection, ...sections]).map(
                (label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ),
              )}
              <option value={NEW_SECTION_OPTION}>New section…</option>
            </select>
          )}
        </EntryDetailField>

        {/* Its own field rather than sharing the Section cell: one label can
            only name one control, and "Section & trimming" named two. */}
        <EntryDetailField label="If the resume runs long">
          <button
            type="button"
            role="switch"
            aria-checked={isPrunable(entry)}
            onClick={() => onChange({ ...entry, prunable: !isPrunable(entry) })}
            title="When a generated resume runs past one page, positions marked this way are dropped first. On by default outside your main experience section."
            className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs transition-colors ${
              isPrunable(entry)
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
                : 'border-slate-200 text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <span
              aria-hidden
              className={`h-3 w-6 shrink-0 rounded-full transition-colors ${
                isPrunable(entry) ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span
                className={`block h-2 w-2 rounded-full bg-white transition-transform mt-0.5 ${
                  isPrunable(entry) ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </span>
            Drop this first
          </button>
        </EntryDetailField>
      </EntryDetailFields>

      <div className="p-5">
        <EntryDetailListHeader
          label="Highlights"
          count={entry.bullets.length}
          addLabel="Add highlight"
          onAdd={() => onChange({ ...entry, bullets: [...entry.bullets, ''] })}
        />
        <StringList
          items={entry.bullets}
          onChange={(bullets) => onChange({ ...entry, bullets })}
          placeholder="Describe an accomplishment..."
          multiline
          variant="flat"
          hideAddButton
          emptyLabel="No highlights yet."
          reorderable
          itemBadge={bulletBadge}
          itemExtra={bulletRewrite}
        />
      </div>
    </div>
  );
}
