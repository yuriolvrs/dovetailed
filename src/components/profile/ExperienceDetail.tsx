// What this file is: the Experience editor's right pane -- everything about
// the one position selected in the rail: its title/company headline, the
// dates/location/section/trimming strip, and its list of highlights.
// In plain terms: the form for the job you picked in the sidebar.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { ExperienceEntry } from '../../types';
import { isPrunable } from '../../lib/generation/fitToPage';
import { StringList } from '../StringList';
import { DateRangeCompact } from './DateRangeFields';
import { Btn, FieldInput, fieldInputClass, fieldLabelClass } from '../ui/primitives';

const NEW_SECTION_OPTION = '__new__';

// Headline fields read as the resume line they become -- no box until you
// hover or focus them.
const headlineClass =
  'w-full bg-transparent border-b border-dashed border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors';

/**
 * Two-step delete for a whole position: the first click arms it, the second
 * removes it -- same inline confirm as ResetButton, since losing a position
 * with all its bullets to one stray click is worth a second press.
 * In plain terms: the delete button you have to click twice.
 */
function DeletePositionButton({ onDelete }: { onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400 dark:text-slate-500">Delete this position?</span>
        <Btn
          size="sm"
          onClick={() => {
            setConfirming(false);
            onDelete();
          }}
          className="bg-red-600 hover:bg-red-500 focus:ring-red-600/30"
        >
          Yes
        </Btn>
        <Btn size="sm" variant="secondary" onClick={() => setConfirming(false)}>
          Cancel
        </Btn>
      </div>
    );
  }

  return (
    <Btn size="sm" variant="secondary" onClick={() => setConfirming(true)} ariaLabel="Delete position">
      <Trash2 size={13} />
      Delete
    </Btn>
  );
}

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
      <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex-1 min-w-0">
          <input
            value={entry.title}
            onChange={(e) => onChange({ ...entry, title: e.target.value })}
            placeholder="Job title"
            aria-label="Job title"
            className={`${headlineClass} text-lg font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600`}
          />
          <input
            value={entry.company}
            onChange={(e) => onChange({ ...entry, company: e.target.value })}
            placeholder="Company"
            aria-label="Company"
            className={`${headlineClass} mt-1 text-sm text-slate-500 dark:text-slate-400 placeholder:text-slate-300 dark:placeholder:text-slate-600`}
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Btn size="sm" variant="secondary" onClick={onDuplicate} ariaLabel="Duplicate position">
            <Copy size={13} />
            Duplicate
          </Btn>
          <DeletePositionButton onDelete={onDelete} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 p-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabelClass}>Dates</span>
          <DateRangeCompact entry={entry} update={onChange} currentLabel="Still here" />
        </div>

        <FieldInput
          label="Location"
          placeholder="San Francisco, CA"
          value={entry.location ?? ''}
          onChange={(location) => onChange({ ...entry, location })}
        />

        <div className="flex flex-col gap-1.5 sm:col-span-2 xl:col-span-1">
          <span className={fieldLabelClass}>Section &amp; trimming</span>
          <div className="flex flex-wrap items-center gap-2">
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
                className={`flex-1 min-w-[10rem] ${fieldInputClass}`}
              />
            ) : (
              <select
                value={currentSection}
                aria-label="Section"
                onChange={(e) => {
                  if (e.target.value === NEW_SECTION_OPTION) setNamingSection(true);
                  else onSectionChange(e.target.value);
                }}
                className={`flex-1 min-w-[10rem] ${fieldInputClass}`}
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

            <button
              type="button"
              role="switch"
              aria-checked={isPrunable(entry)}
              onClick={() => onChange({ ...entry, prunable: !isPrunable(entry) })}
              title="When a generated resume runs past one page, positions marked this way are dropped first. On by default outside your main experience section."
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                isPrunable(entry)
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400'
                  : 'border-slate-200 text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <span
                aria-hidden
                className={`h-3 w-6 shrink-0 rounded-full transition-colors ${
                  isPrunable(entry) ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`block h-2 w-2 rounded-full bg-white transition-transform mt-0.5 ${
                    isPrunable(entry) ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              Trim first
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-2 mb-2">
          <span className={fieldLabelClass}>Highlights</span>
          <span className="text-[11px] text-slate-300 dark:text-slate-600">
            {entry.bullets.length}
          </span>
          <span className="flex-1" />
          <Btn
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...entry, bullets: [...entry.bullets, ''] })}
          >
            <Plus size={13} />
            Add highlight
          </Btn>
        </div>

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
