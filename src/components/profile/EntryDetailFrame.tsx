// What this file is: the pieces every entry detail pane is built from -- the
// headline (two inline fields that read as the resume line they become, plus
// Duplicate and a two-step Delete), the bordered strip of supporting fields,
// and the header above a sub-list. Shared so Experience, Education and
// Projects are the same pane with different fields rather than three panes
// that merely resemble each other.
// In plain terms: the common parts of the right-hand editing pane.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { Btn, fieldLabelClass } from '../ui/primitives';
import { AutoGrowTextarea } from '../StringList';

// Headline fields read as the resume line they become -- no box until you
// hover or focus them.
const headlineClass =
  'w-full bg-transparent border-b border-dashed border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors';

/**
 * Two-step delete: the first click arms it, the second removes it -- same
 * inline confirm as ResetButton, since losing an entry and everything under
 * it to one stray click is worth a second press.
 * In plain terms: the delete button you have to click twice.
 */
function DeleteEntryButton({ noun, onDelete }: { noun: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const armedRef = useRef<HTMLDivElement>(null);

  // An armed confirm that outlives the click that armed it is a trap: come
  // back to the pane later and one press deletes. Disarm on any click or
  // Escape outside it.
  useEffect(() => {
    if (!confirming) return;
    function onPointerDown(e: MouseEvent) {
      if (!armedRef.current?.contains(e.target as Node)) setConfirming(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setConfirming(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [confirming]);

  if (confirming) {
    return (
      <div ref={armedRef} className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500 dark:text-slate-400">Delete this {noun}?</span>
        <Btn
          size="sm"
          variant="dangerSolid"
          onClick={() => {
            setConfirming(false);
            onDelete();
          }}
        >
          Yes
        </Btn>
        <Btn size="sm" variant="secondary" onClick={() => setConfirming(false)}>
          Cancel
        </Btn>
      </div>
    );
  }

  // Quieter than Duplicate on purpose: a destructive action should not be
  // the visual twin of a routine one.
  return (
    <Btn size="sm" variant="ghost" onClick={() => setConfirming(true)} ariaLabel={`Delete ${noun}`}>
      <Trash2 size={13} />
      Delete
    </Btn>
  );
}

/**
 * The pane's headline: the entry's two identifying fields, edited in place,
 * with its Duplicate and Delete actions.
 * In plain terms: the big title and subtitle at the top of the editing pane,
 * plus the copy and delete buttons.
 */
export function EntryDetailHeader({
  title,
  titlePlaceholder,
  onTitleChange,
  subtitle,
  subtitlePlaceholder,
  onSubtitleChange,
  subtitleMultiline = false,
  noun,
  onDuplicate,
  onDelete,
  autoFocus = false,
  onFocused,
}: {
  title: string;
  titlePlaceholder: string;
  onTitleChange: (value: string) => void;
  subtitle: string;
  subtitlePlaceholder: string;
  onSubtitleChange: (value: string) => void;
  /** Grows with its content -- for a subtitle that is a sentence, not a name. */
  subtitleMultiline?: boolean;
  /** What one entry is called, e.g. "position" -- used by the delete confirm. */
  noun: string;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Put the caret here: this entry was just added. */
  autoFocus?: boolean;
  onFocused?: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    titleRef.current?.focus();
    onFocused?.();
  }, [autoFocus, onFocused]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-5 border-b border-slate-200 dark:border-slate-800">
      <div className="flex-1 min-w-0">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          aria-label={titlePlaceholder}
          className={`${headlineClass} text-lg font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500`}
        />
        {subtitleMultiline ? (
          <AutoGrowTextarea
            rows={1}
            value={subtitle}
            onChange={(e) => onSubtitleChange(e.target.value)}
            placeholder={subtitlePlaceholder}
            aria-label={subtitlePlaceholder}
            className={`${headlineClass} mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400 placeholder:text-slate-400 dark:placeholder:text-slate-500`}
          />
        ) : (
          <input
            value={subtitle}
            onChange={(e) => onSubtitleChange(e.target.value)}
            placeholder={subtitlePlaceholder}
            aria-label={subtitlePlaceholder}
            className={`${headlineClass} mt-1 text-sm text-slate-500 dark:text-slate-400 placeholder:text-slate-400 dark:placeholder:text-slate-500`}
          />
        )}
      </div>
      <div className="flex items-center gap-1.5 sm:shrink-0">
        <Btn size="sm" variant="secondary" onClick={onDuplicate} ariaLabel={`Duplicate ${noun}`}>
          <Copy size={13} />
          Duplicate
        </Btn>
        <DeleteEntryButton noun={noun} onDelete={onDelete} />
      </div>
    </div>
  );
}

/**
 * The bordered strip of supporting fields under the headline.
 * In plain terms: the row of smaller fields (dates, location, and so on).
 */
export function EntryDetailFields({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 p-5 border-b border-slate-200 dark:border-slate-800">
      {children}
    </div>
  );
}

/** One labelled cell inside EntryDetailFields. */
export function EntryDetailField({
  label,
  hint,
  className = '',
  children,
}: {
  label: string;
  /** Shown under the control. Anything a user would otherwise have to hover
   *  a `title` attribute to discover belongs here instead -- hover reaches
   *  neither touch nor keyboard. */
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
      {hint && <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * The header above a sub-list (highlights, details, bullets, links): its
 * label, how many there are, and the one action that adds another.
 * In plain terms: the little title bar above a list inside the pane.
 */
export function EntryDetailListHeader({
  label,
  count,
  addLabel,
  onAdd,
}: {
  label: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={fieldLabelClass}>{label}</span>
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{count}</span>
      <span className="flex-1" />
      <Btn size="sm" variant="secondary" onClick={onAdd}>
        <Plus size={13} />
        {addLabel}
      </Btn>
    </div>
  );
}
