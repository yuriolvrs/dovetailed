// What this file is: the shared start/end month+year pickers used by the
// Experience and Education forms, including the "Present"/"currently
// here" toggle that clears the end date. DateRangeCompact fits the whole
// range plus the toggle into a single control.
// In plain terms: the date-range fields (start, end, "I'm still here"
// toggle) shown on each job and school entry.

import { Check } from 'lucide-react';
import { MONTHS, yearOptions } from '../ui/primitives';

const YEARS = yearOptions();

interface DateRangeEntry {
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  current: boolean;
}

// Borderless select, sized to sit inside the compact control's box rather
// than carrying a box of its own.
// In plain terms: one dropdown inside the combined date control.
function InlineSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 rounded-lg bg-transparent px-2 py-1.5 text-sm hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04] transition-colors text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400/25 dark:focus:ring-blue-400/20 disabled:text-slate-400 dark:disabled:text-slate-500"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/**
 * The start/end fields as one control sized for
 * the entry editor's narrow field column: a From row and a To row, each
 * labelled, with the "still here" toggle beneath.
 *
 * The earlier version laid all four dropdowns on one line separated by an
 * arrow. At the width this actually renders at, that line wrapped into a 2x2
 * block with the arrow stranded mid-control and nothing saying which row was
 * the start -- so the labels are the fix, not decoration.
 *
 * In plain terms: the compact date fields on each job or school entry.
 */
/**
 * Whether the end date lands before the start date. Only judges when both
 * are complete enough to compare -- a half-filled range is in progress, not
 * wrong.
 * In plain terms: checks you didn't leave a job before you started it.
 */
function endsBeforeStart(entry: DateRangeEntry): boolean {
  if (entry.current) return false;
  const { startYear, endYear, startMonth, endMonth } = entry;
  if (!startYear || !endYear) return false;
  if (endYear !== startYear) return Number(endYear) < Number(startYear);
  if (!startMonth || !endMonth) return false;
  const months: readonly string[] = MONTHS;
  return months.indexOf(endMonth) < months.indexOf(startMonth);
}

export function DateRangeCompact<T extends DateRangeEntry>({
  entry,
  update,
  currentLabel,
}: {
  entry: T;
  update: (next: T) => void;
  currentLabel: string;
}) {
  const rowLabel = 'text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400';
  const invalid = endsBeforeStart(entry);

  return (
    <div className="max-w-sm">
      <div className="-ml-2 grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1 gap-y-0.5">
        <span className={`${rowLabel} pl-2 pr-1`}>From</span>
        <InlineSelect
          label="Start month"
          value={entry.startMonth ?? ''}
          onChange={(startMonth) => update({ ...entry, startMonth })}
          options={MONTHS}
          placeholder="Month"
        />
        <InlineSelect
          label="Start year"
          value={entry.startYear ?? ''}
          onChange={(startYear) => update({ ...entry, startYear })}
          options={YEARS}
          placeholder="Year"
        />

        <span className={`${rowLabel} pl-2 pr-1`}>To</span>
        {entry.current ? (
          <span className="col-span-2 px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">
            Present
          </span>
        ) : (
          <>
            <InlineSelect
              label="End month"
              value={entry.endMonth ?? ''}
              onChange={(endMonth) => update({ ...entry, endMonth })}
              options={MONTHS}
              placeholder="Month"
            />
            <InlineSelect
              label="End year"
              value={entry.endYear ?? ''}
              onChange={(endYear) => update({ ...entry, endYear })}
              options={YEARS}
              placeholder="Year"
            />
          </>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={entry.current}
        onClick={() =>
          update({
            ...entry,
            current: !entry.current,
            ...(entry.current ? {} : { endMonth: undefined, endYear: undefined }),
          })
        }
        className={`-ml-2 mt-1 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
          entry.current
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
            : 'text-slate-600 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04] hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        {/* A box, ticked or empty, so the toggle reads as one when off too. */}
        <span
          aria-hidden
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
            entry.current
              ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
              : 'border-slate-400 dark:border-slate-500'
          }`}
        >
          {entry.current && <Check size={10} strokeWidth={3.5} />}
        </span>
        {currentLabel}
      </button>

      {invalid && (
        <p role="alert" className="pt-1 text-xs text-amber-700 dark:text-amber-400">
          The end date is before the start date.
        </p>
      )}
    </div>
  );
}
