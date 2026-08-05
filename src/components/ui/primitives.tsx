// What this file is: shared visual building blocks (Card, Button, Badge,
// SectionTitle, labeled text/textarea fields) used across every page, so the
// app has one consistent look instead of each screen styling its own
// buttons and cards.
// In plain terms: the basic look-and-feel pieces (buttons, cards, form
// fields) that the rest of the app is built out of.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 shadow-[0_1px_4px_rgba(15,23,42,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

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
        <h2 className="text-sm font-semibold text-slate-800">{children}</h2>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
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
}: {
  title: string;
  sub?: string;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Btn size="sm" variant="secondary" onClick={onAdd}>
          <Plus size={13} />
          {addLabel}
        </Btn>
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Collapse' : 'Expand'}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-150 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full flex flex-col transition-all duration-150 ${
          visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

const buttonVariants = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700 focus:ring-slate-900/30 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 focus:ring-slate-400/20',
  ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-400/20',
  danger: 'text-red-600 border border-red-200 hover:bg-red-50 focus:ring-red-400/20',
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
        <span className="text-xs text-slate-500">
          Matching requirement {Math.min(done + 1, total)} of {total}…
        </span>
        <span className="text-xs text-slate-400">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-slate-900 transition-[width] duration-300 ease-out"
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
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
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
  slate: 'bg-slate-100 text-slate-500',
  green: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
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

export const fieldInputClass =
  'px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/25 focus:border-blue-400 transition-all';

export const fieldLabelClass = 'text-[11px] font-semibold text-slate-400 uppercase tracking-widest';

// Small amber dot + "Unsaved" label -- shown next to a field's label while
// its on-screen value differs from what's actually persisted, for fields
// that save on blur rather than on every keystroke.
// In plain terms: the little "Unsaved" indicator that appears while you're
// still typing in a field that only saves once you click away.
export function UnsavedIndicator() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 normal-case tracking-normal">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Unsaved
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
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            {label}
          </label>
          {unsaved && <UnsavedIndicator />}
        </div>
      )}
      <input
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
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            {label}
          </label>
          {unsaved && <UnsavedIndicator />}
        </div>
      )}
      <textarea
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
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <label className={fieldLabelClass}>{label}</label>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldInputClass}>
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
export function TagInput({
  value,
  onChange,
  placeholder = 'Add…',
  emptyLabel = 'Nothing added yet',
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const tag = draft.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setDraft('');
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 min-h-9 mb-4">
        {value.length === 0 && <p className="text-xs text-slate-300 self-center">{emptyLabel}</p>}
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-slate-400 hover:text-slate-700 transition-colors ml-0.5"
              aria-label={`Remove ${tag}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
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
