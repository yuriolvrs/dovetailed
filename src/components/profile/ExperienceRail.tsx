// What this file is: the Experience editor's left rail -- every position
// listed under its section heading, with search, collapsible sections, drag
// reorder (including dragging a position into another section), and the
// add-position/add-section actions.
// In plain terms: the sidebar list of your jobs that you click through to
// edit one at a time.

import { useState } from 'react';
import type { DragEvent } from 'react';
import { ChevronDown, GripVertical, Plus, Scissors, Search } from 'lucide-react';
import type { ExperienceEntry } from '../../types';
import { isPrunable } from '../../lib/generation/fitToPage';
import { groupBySection } from '../../lib/experienceSections';
import { formatMonthYear, fieldInputClass } from '../ui/primitives';

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

function matchesQuery(entry: ExperienceEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [entry.title, entry.company, entry.location, entry.section]
    .filter(Boolean)
    .some((field) => field!.toLowerCase().includes(q));
}

export function ExperienceRail({
  entries,
  selectedIndex,
  onSelect,
  onReorder,
  onAdd,
}: {
  entries: ExperienceEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Move the entry at `from` to sit before the entry at `to`, in section `label`. */
  onReorder: (from: number, to: number, label: string) => void;
  /** Add a blank position at the end of `label`'s section. */
  onAdd: (label: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [newSection, setNewSection] = useState<string | null>(null);

  const groups = groupBySection(entries);
  // Reordering by drag needs the full list on screen to have a meaningful
  // drop position, so it's off while a search is narrowing the list.
  const canDrag = query.trim() === '';

  function toggle(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  function handleDrop(to: number, label: string) {
    if (dragIndex !== null && dragIndex !== to) onReorder(dragIndex, to, label);
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragOver(e: DragEvent, index: number) {
    if (dragIndex === null) return;
    e.preventDefault();
    if (index !== overIndex) setOverIndex(index);
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-950/40 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800">
      <div className="relative">
        <Search
          size={13}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a position"
          aria-label="Find a position"
          className={`w-full pl-8 ${fieldInputClass}`}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        {groups.map((group) => {
          const shown = group.items.filter((item) => matchesQuery(item.entry, query));
          const isCollapsed = collapsed.has(group.label);
          const lastIndex = group.items[group.items.length - 1].index;

          return (
            <div key={group.label}>
              <div
                className="flex items-center gap-1.5 px-1 py-1.5"
                onDragOver={canDrag ? (e) => handleDragOver(e, lastIndex + 1) : undefined}
                onDrop={canDrag ? () => handleDrop(lastIndex + 1, group.label) : undefined}
              >
                <button
                  type="button"
                  onClick={() => toggle(group.label)}
                  aria-expanded={!isCollapsed}
                  className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                  <span className="truncate">{group.label}</span>
                </button>
                <span className="text-[11px] text-slate-300 dark:text-slate-600">
                  {group.items.length}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(group.label)}
                  aria-label={`Add a position to ${group.label}`}
                  className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
                >
                  <Plus size={13} />
                </button>
              </div>

              {!isCollapsed &&
                shown.map(({ entry, index }) => {
                  const selected = index === selectedIndex;
                  const dates = dateSummary(entry);

                  return (
                    <div
                      key={index}
                      onDragOver={canDrag ? (e) => handleDragOver(e, index) : undefined}
                      onDrop={canDrag ? () => handleDrop(index, group.label) : undefined}
                      className={[
                        'rounded-lg border transition-[opacity,border-color,background-color]',
                        selected
                          ? 'border-blue-200 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-500/10'
                          : 'border-transparent hover:bg-white dark:hover:bg-slate-800/50',
                        overIndex === index && dragIndex !== null && dragIndex !== index
                          ? 'border-slate-400 dark:border-slate-500'
                          : '',
                        dragIndex === index ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      <div className="group flex items-start gap-1.5 px-2 py-2">
                        <span
                          draggable={canDrag}
                          onDragStart={() => setDragIndex(index)}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setOverIndex(null);
                          }}
                          aria-label="Drag to reorder"
                          className={`shrink-0 mt-0.5 text-slate-300 dark:text-slate-600 transition-opacity ${
                            canDrag
                              ? 'cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100'
                              : 'opacity-0'
                          }`}
                        >
                          <GripVertical size={13} />
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelect(index)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <span
                            className={`block truncate text-sm font-medium ${
                              selected
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {entry.title.trim() || 'Untitled position'}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                            <span className="truncate">
                              {[entry.company.trim(), dates].filter(Boolean).join(' · ') ||
                                'No details yet'}
                            </span>
                            {isPrunable(entry) && (
                              <Scissors
                                size={10}
                                className="shrink-0 text-amber-500 dark:text-amber-400"
                                role="img"
                              >
                                <title>Dropped first if the resume runs past one page</title>
                              </Scissors>
                            )}
                          </span>
                        </button>
                        <span className="shrink-0 mt-0.5 text-[11px] text-slate-300 dark:text-slate-600">
                          {entry.bullets.length}
                        </span>
                      </div>
                    </div>
                  );
                })}

              {!isCollapsed && shown.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-slate-300 dark:text-slate-600">
                  {query.trim() ? 'No matches here.' : 'Nothing in this section yet.'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {newSection === null ? (
        <button
          type="button"
          onClick={() => setNewSection('')}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-300 hover:text-slate-700 dark:hover:border-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <Plus size={13} />
          New section
        </button>
      ) : (
        <input
          autoFocus
          value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          onBlur={() => setNewSection(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setNewSection(null);
            if (e.key !== 'Enter') return;
            const label = newSection.trim();
            if (label) onAdd(label);
            setNewSection(null);
          }}
          placeholder="Section name, then Enter"
          aria-label="New section name"
          className={`w-full ${fieldInputClass}`}
        />
      )}
    </div>
  );
}
