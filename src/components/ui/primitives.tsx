// What this file is: shared visual building blocks (Card, Button, Badge,
// SectionTitle, labeled text/textarea fields) used across every page, so the
// app has one consistent look instead of each screen styling its own
// buttons and cards.
// In plain terms: the basic look-and-feel pieces (buttons, cards, form
// fields) that the rest of the app is built out of.

import { forwardRef, useEffect, useId, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Check, ChevronDown, Plus, RotateCcw, X } from 'lucide-react';
import type { ProfileAtom } from '../../types';
import { useEscapeKey } from '../../lib/useEscapeKey';

// forwardRef so a section can scroll its own Card into view (e.g. a
// preview-click navigation -- see ResumeNavTarget) without every caller
// having to wrap it in an extra div just to attach a ref.
export const Card = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
  ({ children, className = '' }, ref) => (
    <div
      ref={ref}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_1px_4px_rgba(15,23,42,0.06)] dark:shadow-none ${className}`}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

export function SectionTitle({
  children,
  sub,
  right,
}: {
  children: ReactNode;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{children}</h2>
        {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// Header for a collapsible, add-one-more list section (Work Experience,
// Projects, Education, Writing Samples): title/sub on the left, an Add
// button and expand/collapse chevron on the right.
// In plain terms: the title bar you see above sections like Work Experience,
// with an Add button and a collapse arrow.
export function CollapsibleSectionHeader({
  title,
  sub,
  open,
  onToggle,
  onAdd,
  addLabel = 'Add',
  extraActions,
}: {
  title: string;
  sub?: string;
  open: boolean;
  onToggle: () => void;
  /** Omit for sections with nothing to add (e.g. Contact Information) -- the Add button is hidden and only the chevron shows. */
  onAdd?: () => void;
  addLabel?: string;
  /** Extra buttons rendered before the Add button, e.g. Skills' "AI Categorize". */
  extraActions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        {extraActions}
        {onAdd && (
          <Btn size="sm" variant="secondary" onClick={onAdd}>
            <Plus size={13} />
            {addLabel}
          </Btn>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Collapse' : 'Expand'}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
    </div>
  );
}

// Animates a section's content in/out on open/close, using the CSS
// grid-template-rows 0fr/1fr trick so it works without measuring the
// content's height (which varies with the number of list items).
// In plain terms: smoothly expands/collapses a section instead of it
// snapping open or shut.
export function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// A centered modal dialog with a dimmed backdrop that closes it on click --
// used where a picker/form needs more room than an inline card section (e.g.
// the Matching review screen's "Add evidence" picker). Callers structure
// header/scrollable body/footer themselves via children; this only owns the
// overlay chrome and a plain CSS fade/scale-in transition (no animation
// library).
// In plain terms: the popup window with a dimmed background that appears
// over the page, like the "Add evidence" picker.
export function Modal({
  open,
  onClose,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return;
    }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEscapeKey(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full flex flex-col transition-all duration-150 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

const buttonVariants = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-700 focus:ring-slate-900/30 shadow-sm dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus:ring-slate-400/20 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800',
  ghost:
    'text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-400/20 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger:
    'text-red-600 border border-red-200 hover:bg-red-50 focus:ring-red-400/20 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10',
  // Solid destructive, for the confirm step of a two-step delete. It exists
  // as a variant because appending `bg-red-600` to `primary` does not work:
  // both set the same property, and `primary`'s own `dark:` classes carry
  // higher specificity, so the red silently lost and the button rendered
  // white-on-white in dark mode.
  dangerSolid:
    'bg-red-600 text-white hover:bg-red-500 focus:ring-red-600/30 shadow-sm dark:bg-red-600 dark:text-white dark:hover:bg-red-500',
} as const;

const buttonSizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
} as const;

export function Btn({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-xl font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// A "Reset" action that discards unsaved edits, so it asks for a second
// click before firing -- same inline two-step confirm as BackupControls'
// "Delete All Data", just scoped to one button instead of a whole section.
// In plain terms: the reset button used on a resume section's header; you
// have to click it twice (with a Cancel escape hatch) before it actually
// discards your edits to that section.
export function ResetButton({ onReset, label = 'Reset' }: { onReset: () => void; label?: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400 dark:text-slate-500">Discard edits?</span>
        <Btn
          size="sm"
          onClick={() => {
            onReset();
            setConfirming(false);
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
    <Btn size="sm" variant="secondary" onClick={() => setConfirming(true)} ariaLabel={label}>
      <RotateCcw size={13} />
      {label}
    </Btn>
  );
}

// Thin labeled progress bar -- used where a multi-step background pass (e.g.
// one LLM call per requirement during matching) can report how far along it
// is, instead of just an indefinite spinner.
// In plain terms: the progress bar shown while matching works through your
// requirements one by one.
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Matching requirement {Math.min(done + 1, total)} of {total}…
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-slate-900 dark:bg-slate-100 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Pulsing gray placeholder block -- the building block for loading
// skeletons that roughly match a section's real shape instead of a plain
// "Loading…" line.
// In plain terms: one gray animated bar shown while real content loads.
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 ${className}`} />;
}

// Full-page loading placeholder: a title-width bar and a narrower subtitle
// bar, then `cards` card-shaped blocks -- used by pages that load a single
// record (profile, one job posting, one generation) before rendering.
// In plain terms: the skeleton shown while a whole page's data is loading.
export function PageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="pb-16">
      <Skeleton className="h-5 w-40 mb-2" />
      <Skeleton className="h-3.5 w-72 mb-6" />
      <div className="space-y-4">
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}

const badgeColors = {
  slate: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
} as const;

export function Badge({
  children,
  color = 'slate',
}: {
  children: ReactNode;
  color?: keyof typeof badgeColors;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${badgeColors[color]}`}
    >
      {children}
    </span>
  );
}

// Wraps a badge/trigger with a hover-only tooltip listing the exact profile
// atom(s) (source + verbatim text) a generated bullet/paragraph is grounded
// in -- pure CSS (group/group-hover), no click handler, since clicking a
// bullet already opens its edit field. A no-op passthrough when there's
// nothing to show, so callers can pass an empty array unconditionally.
// In plain terms: hover over a "matched"/"sourced" badge to see the exact
// line from your profile it came from.
export function AtomHoverDetail({ atoms, children }: { atoms: ProfileAtom[]; children: ReactNode }) {
  if (atoms.length === 0) return <>{children}</>;
  return (
    <span className="group relative inline-block">
      {children}
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-left shadow-lg group-hover:block">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Grounded in your profile
        </span>
        <span className="block space-y-1.5">
          {atoms.map((atom) => (
            <span key={atom.id} className="block text-xs text-slate-600 dark:text-slate-300">
              <span className="block text-[11px] text-slate-400 dark:text-slate-500">{atom.sourceLabel}</span>“{atom.text}”
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

const emptyStateSizes = {
  // Inline "this list has nothing in it yet" -- used inside a Card that's
  // already visually distinct, so the box itself stays understated.
  sm: 'py-8 text-xs rounded-xl',
  // A whole page/tab with nothing in it at all -- one size up, and given its
  // own white background since there's no enclosing Card providing one.
  lg: 'py-20 text-sm rounded-2xl bg-white dark:bg-slate-900',
} as const;

// The one dashed-box empty-state look used everywhere a list, section, or
// page has nothing in it yet -- every such spot in the app should render
// through this instead of re-typing the same border/color classes, so a
// future style change (or an audit like this one) only has one place to
// touch.
// In plain terms: the shared "nothing here yet" box design, used consistently
// across every empty list and empty page in the app.
export function EmptyState({
  children,
  size = 'sm',
  className = '',
  role,
}: {
  children: ReactNode;
  size?: keyof typeof emptyStateSizes;
  className?: string;
  /** Pass "status" where the list becoming empty (or filling) is worth
   *  announcing -- otherwise the change is silent to a screen reader. */
  role?: 'status';
}) {
  return (
    <div
      role={role}
      className={`text-center text-slate-500 dark:text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 ${emptyStateSizes[size]} ${className}`}
    >
      {children}
    </div>
  );
}

export const fieldInputClass =
  'px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25 focus:border-blue-400 transition-all dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-400/20 dark:focus:border-blue-500';

// The same field, minus its box: transparent until you focus it. Used where
// a list of fields should read as content (the Experience editor's
// highlights) rather than as a stack of form controls.
// In plain terms: a text box that looks like plain text until you click into
// it.
export const fieldInputFlatClass =
  'px-2 py-1.5 rounded-lg border border-transparent bg-transparent text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25 focus:border-blue-400 focus:bg-white transition-all dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-400/20 dark:focus:border-blue-500 dark:focus:bg-slate-950';

export const fieldLabelClass = 'text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest';

// Small amber dot + "Unsaved" label -- shown next to a field's label while
// its on-screen value differs from what's actually persisted, for fields
// that save on blur rather than on every keystroke.
// In plain terms: the little "Unsaved" indicator that appears while you're
// still typing in a field that only saves once you click away.
export function UnsavedIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 normal-case tracking-normal">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Unsaved
    </span>
  );
}

// The opposite signal from UnsavedIndicator: a brief "Saved" confirmation
// (see useAutosaveIndicator.ts) shown right after an autosaved edit -- fades
// out on its own rather than needing to be dismissed, so it never becomes a
// permanent fixture cluttering the page.
// In plain terms: the little "Saved" checkmark that flashes briefly after an
// edit autosaves.
export function SavedIndicator({ visible, label = 'Saved' }: { visible: boolean; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 normal-case tracking-normal transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <Check size={11} />
      {label}
    </span>
  );
}

export function FieldInput({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = 'text',
  className = '',
  unsaved = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  className?: string;
  unsaved?: boolean;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <div className="flex items-center gap-2">
          <label htmlFor={id} className={fieldLabelClass}>
            {label}
          </label>
          {unsaved && <UnsavedIndicator />}
        </div>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className={fieldInputClass}
      />
    </div>
  );
}

export function FieldTextarea({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 4,
  className = '',
  unsaved = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  unsaved?: boolean;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <div className="flex items-center gap-2">
          <label htmlFor={id} className={fieldLabelClass}>
            {label}
          </label>
          {unsaved && <UnsavedIndicator />}
        </div>
      )}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className={`${fieldInputClass} resize-y leading-relaxed`}
      />
    </div>
  );
}

export function FieldSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className={fieldLabelClass}>
          {label}
        </label>
      )}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Descending list of years for start/end date dropdowns (next year down to 60 years back).
 * In plain terms: the year choices shown in a date dropdown, newest first.
 */
export function yearOptions(): string[] {
  const end = new Date().getFullYear() + 1;
  const start = end - 61;
  const years: string[] = [];
  for (let year = end; year >= start; year--) {
    years.push(String(year));
  }
  return years;
}

/**
 * Renders a month/year pair as e.g. "March 2022", "2022", or "" if both are empty.
 * In plain terms: turns a month + year into the text shown on a resume date.
 */
export function formatMonthYear(month?: string, year?: string): string {
  if (!year) return month ?? '';
  return month ? `${month} ${year}` : year;
}

// Flat chip list with an add-one input, e.g. profile skills or a job
// posting's extracted keywords: type a value, hit Enter or Add, click x to
// remove a chip.
// In plain terms: the "type a word, press Enter to add a chip" input used
// for things like skills and keywords.
// Custom drag MIME type used by TagInput -- checking for its presence in
// dragover (via e.dataTransfer.types, which is readable before drop, unlike
// getData) is how a TagInput tells a compatible drag from an unrelated one
// (e.g. dragging a file over the page).
const TAG_DRAG_MIME = 'application/x-tag';

interface TagDragPayload {
  groupId: string;
  index: number;
  tag: string;
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add…',
  emptyLabel = 'Nothing added yet',
  dragGroupId,
  onExternalTagDrop,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
  /** Identifies this list for cross-list drag-and-drop (e.g. a skill category's index) -- tags dropped from a list with a different id are handled via onExternalTagDrop instead of the internal reorder. */
  dragGroupId?: string;
  /** Called when a tag dragged from a different dragGroupId list is dropped here at the given index; the parent owns removing it from the source list and inserting it here. */
  onExternalTagDrop?: (payload: TagDragPayload, atIndex: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function add() {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setDraft('');
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditDraft(value[index]);
  }

  function commitEdit() {
    if (editingIndex === null) return;
    const text = editDraft.trim();
    if (text) {
      onChange(value.map((t, i) => (i === editingIndex ? text : t)));
    } else {
      onChange(value.filter((_, i) => i !== editingIndex));
    }
    setEditingIndex(null);
  }

  function handleDragStart(e: DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TAG_DRAG_MIME, JSON.stringify({ groupId: dragGroupId ?? '', index, tag: value[index] }));
    setDragIndex(index);
  }

  function handleDragOver(e: DragEvent, index: number) {
    if (!e.dataTransfer.types.includes(TAG_DRAG_MIME)) return;
    e.preventDefault();
    if (index !== overIndex) setOverIndex(index);
  }

  function handleContainerDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(TAG_DRAG_MIME)) return;
    e.preventDefault();
    if (overIndex !== value.length) setOverIndex(value.length);
  }

  function handleDrop(e: DragEvent, atIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragIndex(null);
    setOverIndex(null);
    let payload: TagDragPayload;
    try {
      payload = JSON.parse(e.dataTransfer.getData(TAG_DRAG_MIME));
    } catch {
      return;
    }

    if (payload.groupId === (dragGroupId ?? '')) {
      if (payload.index === atIndex) return;
      const next = value.slice();
      const [moved] = next.splice(payload.index, 1);
      next.splice(atIndex, 0, moved);
      onChange(next);
    } else {
      onExternalTagDrop?.(payload, atIndex);
    }
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div>
      <div
        className="flex flex-wrap gap-2 min-h-9 mb-4"
        onDragOver={handleContainerDragOver}
        onDrop={(e) => handleDrop(e, value.length)}
      >
        {value.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400 self-center">{emptyLabel}</p>}
        {value.map((tag, index) =>
          editingIndex === index ? (
            <input
              key={index}
              autoFocus
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  setEditingIndex(null);
                }
              }}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-full text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-100/20"
              style={{ width: `calc(${Math.max(editDraft.length, 4)}ch + 2rem)` }}
            />
          ) : (
            <span
              key={index}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onDoubleClick={() => startEdit(index)}
              className={[
                'inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-full text-xs font-medium cursor-grab active:cursor-grabbing transition-[opacity,border-color] border',
                overIndex === index ? 'border-slate-400 dark:border-slate-500' : 'border-transparent',
                dragIndex === index ? 'opacity-50' : '',
              ].join(' ')}
              title="Drag to reorder, double-click to edit"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors ml-0.5"
                aria-label={`Remove ${tag}`}
              >
                <X size={10} />
              </button>
            </span>
          ),
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className={`flex-1 ${fieldInputClass}`}
        />
        <Btn size="sm" variant="secondary" onClick={add}>
          <Plus size={13} />
          Add
        </Btn>
      </div>
    </div>
  );
}
