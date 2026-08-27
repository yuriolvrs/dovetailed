// What this file is: the left rail shared by every list-of-entries editor on
// the Profile page (Experience, Education, Projects) -- one entry per row,
// optionally grouped under section headings, with search, collapsible
// groups, drag reorder, and per-group add actions. Callers supply how a row
// reads (title, subtitle, trailing meta) and which fields search looks at;
// everything else is the same on all three tabs so they behave identically.
// In plain terms: the sidebar list you click through to edit one entry at a
// time, shared by the Experience, Education and Projects tabs.

import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { ChevronDown, GripVertical, Plus, Search } from 'lucide-react';
import { fieldInputClass } from '../ui/primitives';

/** One entry paired with its index in the caller's flat array. */
export interface RailItem<T> {
  entry: T;
  index: number;
}

export interface RailGroup<T> {
  label: string;
  items: RailItem<T>[];
}

/**
 * How a row reads. Kept as one object so a caller describes a row in one
 * place instead of threading four render props through.
 * In plain terms: what to show on each line of the sidebar.
 */
export interface RailRow {
  /** Main line. Falsy renders the placeholder instead. */
  title: string;
  /** Placeholder shown when `title` is empty, e.g. "Untitled position". */
  untitled: string;
  /** Second line -- falsy renders `emptySubtitle`. */
  subtitle: string;
  emptySubtitle: string;
  /** Optional trailing mark, e.g. a bullet count or a warning icon. */
  meta?: ReactNode;
}

// Search only earns its place once the list is long enough to be worth
// filtering; below that it is one more control between you and the entries.
const SEARCH_THRESHOLD = 6;

export function EntryRail<T>({
  groups,
  total,
  selectedIndex,
  onSelect,
  onReorder,
  onAdd,
  row,
  searchFields,
  searchPlaceholder,
  showGroupHeaders = false,
  footer,
}: {
  groups: RailGroup<T>[];
  /** Total entries across all groups -- decides whether search is shown. */
  total: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** Move the entry at `from` to sit before the entry at `to`, in group `label`. */
  onReorder: (from: number, to: number, label: string) => void;
  /** Add a blank entry at the end of `label`'s group. */
  onAdd: (label: string) => void;
  row: (entry: T) => RailRow;
  searchFields: (entry: T) => (string | undefined)[];
  searchPlaceholder: string;
  /** Group headings are only meaningful where the user can create groups. */
  showGroupHeaders?: boolean;
  /** Extra control under the list, e.g. Experience's "New section". */
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Reordering by drag needs the full list on screen to have a meaningful
  // drop position, so it's off while a search is narrowing the list.
  const canDrag = query.trim() === '';
  const showSearch = total >= SEARCH_THRESHOLD;

  function matchesQuery(entry: T): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return searchFields(entry)
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(q));
  }

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
      {showSearch && (
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className={`w-full pl-8 ${fieldInputClass}`}
          />
        </div>
      )}

      <div className="flex flex-col gap-0.5">
        {groups.map((group) => {
          const shown = group.items.filter((item) => matchesQuery(item.entry));
          const isCollapsed = collapsed.has(group.label);
          const lastIndex = group.items[group.items.length - 1]?.index ?? -1;

          return (
            <div key={group.label}>
              {showGroupHeaders && (
                <div
                  className="flex items-center gap-1.5 px-1 py-1.5"
                  onDragOver={canDrag ? (e) => handleDragOver(e, lastIndex + 1) : undefined}
                  onDrop={canDrag ? () => handleDrop(lastIndex + 1, group.label) : undefined}
                >
                  <button
                    type="button"
                    onClick={() => toggle(group.label)}
                    aria-expanded={!isCollapsed}
                    className="flex flex-1 items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    <ChevronDown
                      size={12}
                      className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                    />
                    <span className="truncate">{group.label}</span>
                  </button>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {group.items.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdd(group.label)}
                    aria-label={`Add to ${group.label}`}
                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )}

              {!isCollapsed &&
                shown.map(({ entry, index }) => {
                  const selected = index === selectedIndex;
                  const { title, untitled, subtitle, emptySubtitle, meta } = row(entry);

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
                          className={`shrink-0 mt-0.5 text-slate-400 dark:text-slate-500 transition-opacity ${
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
                            {title.trim() || untitled}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="truncate">{subtitle || emptySubtitle}</span>
                          </span>
                        </button>
                        {meta && <span className="shrink-0 mt-0.5">{meta}</span>}
                      </div>
                    </div>
                  );
                })}

              {!isCollapsed && shown.length === 0 && (
                <p className="px-2 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {query.trim() ? 'No matches here.' : 'Nothing here yet.'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {footer}
    </div>
  );
}
