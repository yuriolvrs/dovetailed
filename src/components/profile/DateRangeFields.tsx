// What this file is: the shared start/end month+year pickers used by the
// Experience and Education forms, including the "Present"/"currently
// here" toggle that clears the end date. Two layouts over the same fields:
// the stacked DateRangeFields, and DateRangeCompact, which fits the whole
// range plus the toggle into a single control.
// In plain terms: the date-range fields (start, end, "I'm still here"
// toggle) shown on each job and school entry.

import { Check } from 'lucide-react';
import { FieldSelect, MONTHS, fieldLabelClass, yearOptions } from '../ui/primitives';

const YEARS = yearOptions();

interface DateRangeEntry {
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  current: boolean;
}

export function DateRangeFields<T extends DateRangeEntry>({
  entry,
  update,
  currentLabel,
}: {
  entry: T;
  update: (next: T) => void;
  currentLabel: string;
}) {
  return (
    <>
      {/* Start and End stack on phones -- each already splits into its own
          month/year pair, so keeping them side by side put four dropdowns
          across a 375px screen. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className={`mb-1.5 block ${fieldLabelClass}`}>Start Date</span>
          <div className="grid grid-cols-2 gap-2">
            <FieldSelect
              value={entry.startMonth ?? ''}
              onChange={(startMonth) => update({ ...entry, startMonth })}
              options={MONTHS}
              placeholder="Month"
            />
            <FieldSelect
              value={entry.startYear ?? ''}
              onChange={(startYear) => update({ ...entry, startYear })}
              options={YEARS}
              placeholder="Year"
            />
          </div>
        </div>
        <div>
          <span className={`mb-1.5 block ${fieldLabelClass}`}>End Date</span>
          {entry.current ? (
            <div className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-sm">
              Present
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <FieldSelect
                value={entry.endMonth ?? ''}
                onChange={(endMonth) => update({ ...entry, endMonth })}
                options={MONTHS}
                placeholder="Month"
              />
              <FieldSelect
                value={entry.endYear ?? ''}
                onChange={(endYear) => update({ ...entry, endYear })}
                options={YEARS}
                placeholder="Year"
              />
            </div>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={entry.current}
          onChange={(e) =>
            update({
              ...entry,
              current: e.target.checked,
              ...(e.target.checked ? { endMonth: undefined, endYear: undefined } : {}),
            })
          }
          className="rounded border-slate-300 dark:border-slate-600 text-blue-600"
        />
        {currentLabel}
      </label>
    </>
  );
}

// Borderless select, sized to sit inside DateRangeCompact's single box
// rather than carrying a box of its own.
// In plain terms: one dropdown inside the combined date control.
function InlineSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg bg-transparent px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400/25 dark:focus:ring-blue-400/20"
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
 * The same start/end fields as DateRangeFields, but as one control: start
 * and end sit side by side and "still here" is a toggle inside the box
 * instead of a separate checkbox row. Used by the Experience editor, where
 * three stacked rows for a date range crowded out the content below them.
 *
 * In plain terms: the compact one-line version of the date fields.
 */
export function DateRangeCompact<T extends DateRangeEntry>({
  entry,
  update,
  currentLabel,
}: {
  entry: T;
  update: (next: T) => void;
  currentLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
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

      <span aria-hidden className="px-0.5 text-slate-300 dark:text-slate-600">
        &rarr;
      </span>

      {entry.current ? (
        <span className="px-2 py-1.5 text-sm text-slate-400 dark:text-slate-500">Present</span>
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
        className={`ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          entry.current
            ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300'
        }`}
      >
        <Check size={12} strokeWidth={3} className={entry.current ? '' : 'opacity-0'} />
        {currentLabel}
      </button>
    </div>
  );
}
