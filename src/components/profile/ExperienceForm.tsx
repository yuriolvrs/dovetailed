// What this file is: the Experience tab -- a rail listing every position
// under its section heading next to a detail pane for the one that's
// selected, so the list stays visible while you edit one job. Uses the same
// EntryEditor shell as the Education and Projects tabs, plus the one thing
// only this tab has: user-named sections a position can be moved between.
// In plain terms: the screen where you list your past jobs and what you did
// at each one.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, Scissors } from 'lucide-react';
import type { ExperienceEntry } from '../../types';
import {
  DEFAULT_SECTION,
  addEntryToSection,
  groupBySection,
  moveEntryToSection,
  sectionOf,
  sectionOrder,
  setEntrySection,
} from '../../lib/experienceSections';
import { isPrunable } from '../../lib/generation/fitToPage';
import { EntryEditor } from './EntryEditor';
import { ExperienceDetail } from './ExperienceDetail';
import { formatMonthYear, fieldInputClass } from '../ui/primitives';

function newExperienceEntry(): ExperienceEntry {
  return { section: 'Experience', company: '', title: '', current: false, bullets: [] };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * One position's date range as a single line, e.g. "Jan 2023 – Present".
 * In plain terms: the short "from – to" text under a job in the list.
 */
function dateSummary(entry: ExperienceEntry): string {
  const start = formatMonthYear(entry.startMonth, entry.startYear);
  const end = entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear);
  if (!start && !end) return '';
  return `${start || '?'} – ${end || '?'}`;
}

/**
 * The rail's "New section" control: a button until you click it, then a
 * field that creates the section by adding its first position.
 * In plain terms: the button at the bottom of the sidebar for starting a new
 * group of jobs.
 */
function NewSectionControl({ onAdd }: { onAdd: (label: string) => void }) {
  const [name, setName] = useState<string | null>(null);

  if (name === null) {
    return (
      <button
        type="button"
        onClick={() => setName('')}
        className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-300 hover:text-slate-700 dark:hover:border-slate-600 dark:hover:text-slate-200 transition-colors"
      >
        <Plus size={13} />
        New section
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => setName(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setName(null);
        if (e.key !== 'Enter') return;
        const label = name.trim();
        if (label) onAdd(label);
        setName(null);
      }}
      placeholder="Section name, then Enter"
      aria-label="New section name"
      className={`w-full ${fieldInputClass}`}
    />
  );
}

export function ExperienceForm({
  value,
  onChange,
  bulletBadge,
  bulletRewrite,
  saved,
}: {
  value: ExperienceEntry[];
  onChange: (experience: ExperienceEntry[]) => void;
  /** Optional per-bullet extra content (e.g. an "unevidenced" warning badge) -- used by ResumeEditor, unused on the Profile page. */
  bulletBadge?: (bulletText: string) => ReactNode;
  /** Optional per-bullet "suggest a rewording" action -- used by ResumeEditor and the Profile page. */
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
  saved?: boolean;
}) {
  const [selected, setSelected] = useState(0);

  const selectedIndex = value.length === 0 ? -1 : Math.min(selected, value.length - 1);
  const sections = value.length === 0 ? [DEFAULT_SECTION] : sectionOrder(value);
  const bulletTotal = value.reduce((total, entry) => total + entry.bullets.length, 0);

  function apply({ entries, index }: { entries: ExperienceEntry[]; index: number }) {
    onChange(entries);
    setSelected(index);
  }

  function addPosition(label: string) {
    apply(addEntryToSection(value, label, newExperienceEntry));
  }

  return (
    <EntryEditor<ExperienceEntry>
      title="Work Experience"
      sub={`${count(value.length, 'position')} · ${count(bulletTotal, 'highlight')}`}
      items={value}
      onChange={onChange}
      newItem={newExperienceEntry}
      duplicate={(entry) => ({ ...entry, bullets: [...entry.bullets] })}
      addLabel="Add position"
      emptyLabel="No experience entries yet."
      searchPlaceholder="Find a position"
      searchFields={(entry) => [entry.title, entry.company, entry.location, entry.section]}
      saved={saved}
      selectedIndex={selected}
      onSelect={setSelected}
      groups={groupBySection(value)}
      showGroupHeaders
      onAddToGroup={(label) =>
        addPosition(label || (selectedIndex >= 0 ? sectionOf(value[selectedIndex]) : DEFAULT_SECTION))
      }
      onReorder={(from, to, label) => apply(moveEntryToSection(value, from, to, label))}
      railFooter={<NewSectionControl onAdd={addPosition} />}
      row={(entry) => ({
        title: entry.title,
        untitled: 'Untitled position',
        subtitle: [entry.company.trim(), dateSummary(entry)].filter(Boolean).join(' · '),
        emptySubtitle: 'No details yet',
        meta: (
          <span className="flex items-center gap-1.5">
            {isPrunable(entry) && (
              <Scissors
                size={10}
                className="shrink-0 text-amber-500 dark:text-amber-400"
                role="img"
              >
                <title>Dropped first if the resume runs past one page</title>
              </Scissors>
            )}
            {entry.bullets.length > 0 && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {entry.bullets.length}
              </span>
            )}
          </span>
        ),
      })}
      renderDetail={({ entry, update, onDuplicate, onDelete, autoFocus, onFocused }) => (
        <ExperienceDetail
          entry={entry}
          onChange={update}
          autoFocus={autoFocus}
          onFocused={onFocused}
          onSectionChange={(label) => apply(setEntrySection(value, selectedIndex, label))}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          sections={sections}
          bulletBadge={bulletBadge}
          bulletRewrite={bulletRewrite}
        />
      )}
    />
  );
}
