// What this file is: the shared start/end month+year picker used by both the
// Experience and Education forms, including the "Present"/"currently
// here" checkbox that clears the end date.
// In plain terms: the date-range fields (start, end, "I'm still here"
// checkbox) shown on each job and school entry.

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
      <div className="grid grid-cols-2 gap-3">
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
            <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-sm">
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

      <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
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
          className="rounded border-slate-300 text-blue-600"
        />
        {currentLabel}
      </label>
    </>
  );
}
