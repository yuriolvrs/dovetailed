// What this file is: a list of profile entries (jobs, projects, schools) that
// reads like the resume they become, where one entry at a time opens for
// editing right where it sits. Each entry supplies its own read-only summary
// and its own detail pane (the same ExperienceDetail / ProjectDetail /
// EducationDetail panes the old tabs used).
// In plain terms: your entries shown as resume lines; click one to edit it in
// place, press Done to close it.

import type { ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Check, Pencil } from 'lucide-react';
import { Btn } from '../ui/primitives';

/** Actions the detail pane gets for the entry it is showing. */
export interface DetailActions<T> {
  entry: T;
  update: (next: T) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** True when this entry was just added, so the pane focuses its first field. */
  autoFocus: boolean;
  onFocused: () => void;
}

/** How one entry reads when it is closed. */
export interface EntrySummary {
  title: string;
  untitled: string;
  /** Second line, e.g. the role or the description. */
  subtitle?: string;
  /** Right-aligned on the title line, e.g. the dates. */
  aside?: string;
  bullets: string[];
  /** Shown as a red flag when set, e.g. "No bullets yet". */
  warning?: string;
}

/** How many bullets a closed entry shows before "and N more". */
const PREVIEW_BULLETS = 3;

/**
 * A list of entries with one open editor at a time. `indexes` picks which
 * entries of `items` this list shows, in order, so Experience can render one
 * list per section while edits still go to the one shared array.
 * In plain terms: shows the entries, and swaps the one you clicked for its
 * edit form.
 */
export function InlineEntryList<T>({
  items,
  indexes,
  onChange,
  duplicate,
  summary,
  renderDetail,
  openIndex,
  onOpen,
  focusNew,
  onFocused,
  noun,
}: {
  items: T[];
  indexes?: number[];
  onChange: (next: T[]) => void;
  duplicate: (entry: T) => T;
  summary: (entry: T) => EntrySummary;
  renderDetail: (actions: DetailActions<T> & { index: number }) => ReactNode;
  /** Index in `items` of the open entry, or null when all are closed. */
  openIndex: number | null;
  onOpen: (index: number | null) => void;
  /** True right after an add, so the opened editor takes focus. */
  focusNew: boolean;
  onFocused: () => void;
  /** What one entry is called, for button labels, e.g. "role". */
  noun: string;
}) {
  const shown = indexes ?? items.map((_, i) => i);

  // Swaps two entries of the shared array; used by Move up / Move down.
  function swap(a: number, b: number) {
    const next = items.slice();
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
    if (openIndex === a) onOpen(b);
  }

  return (
    <ul className="flex flex-col gap-1">
      {shown.map((index, position) => {
        const entry = items[index];
        if (openIndex === index) {
          const prev = shown[position - 1];
          const next = shown[position + 1];
          return (
            <li
              key={index}
              data-entry-index={index}
              className="scroll-mt-24 -mx-3 rounded-xl bg-slate-50 dark:bg-slate-800/40"
            >
              {renderDetail({
                index,
                entry,
                update: (value) => onChange(items.map((e, i) => (i === index ? value : e))),
                onDuplicate: () => {
                  const copy = items.slice();
                  copy.splice(index + 1, 0, duplicate(entry));
                  onChange(copy);
                  onOpen(index + 1);
                },
                onDelete: () => {
                  onChange(items.filter((_, i) => i !== index));
                  onOpen(null);
                },
                autoFocus: focusNew,
                onFocused,
              })}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 dark:border-slate-700/60 px-5 py-3">
                <Btn size="sm" onClick={() => onOpen(null)}>
                  <Check size={13} />
                  Done
                </Btn>
                <span className="flex-1" />
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={prev === undefined}
                  onClick={() => prev !== undefined && swap(index, prev)}
                  ariaLabel={`Move ${noun} up`}
                >
                  <ArrowUp size={13} />
                  Up
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={next === undefined}
                  onClick={() => next !== undefined && swap(index, next)}
                  ariaLabel={`Move ${noun} down`}
                >
                  <ArrowDown size={13} />
                  Down
                </Btn>
              </div>
            </li>
          );
        }

        const s = summary(entry);
        const extra = s.bullets.length - PREVIEW_BULLETS;
        return (
          <li key={index} data-entry-index={index} className="scroll-mt-24">
            <button
              type="button"
              onClick={() => onOpen(index)}
              className="group -mx-3 w-[calc(100%+1.5rem)] text-left rounded-xl px-3 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
            >
              <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="min-w-0 font-semibold text-slate-900 dark:text-slate-100">
                  {s.title.trim() || <span className="text-slate-500 dark:text-slate-400">{s.untitled}</span>}
                  {s.warning && (
                    <span className="ml-2 inline-flex items-center gap-1 align-middle rounded-full border border-red-200 bg-red-50 px-2 py-px text-[11px] font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      <AlertCircle size={11} aria-hidden />
                      {s.warning}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                  {s.aside}
                  <Pencil
                    size={13}
                    aria-hidden
                    className="text-slate-400 transition-colors group-hover:text-slate-700 group-focus-visible:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200 dark:group-focus-visible:text-slate-200"
                  />
                </span>
              </span>
              {s.subtitle?.trim() && (
                <span className="block text-sm text-slate-600 dark:text-slate-400">{s.subtitle}</span>
              )}
              {s.bullets.length > 0 && (
                <span className="mt-1.5 block space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
                  {s.bullets.slice(0, PREVIEW_BULLETS).map((bullet, i) => (
                    <span key={i} className="flex gap-2">
                      <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
                      <span className="line-clamp-2">{bullet}</span>
                    </span>
                  ))}
                  {extra > 0 && (
                    <span className="block pl-3 text-xs text-slate-500 dark:text-slate-400">and {extra} more</span>
                  )}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
