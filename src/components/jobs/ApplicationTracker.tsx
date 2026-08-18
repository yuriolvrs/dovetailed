// What this file is: the application-tracking strip on a job's detail page --
// where the posting stops being a document to analyze and starts being an
// application you're running. Replaces what were two plain form controls (a
// status <select> and a bare date input) with a one-click status pipeline and
// a deadline that only takes up room once it exists. Status colors come from
// jobStore's STATUS_COLORS so a status reads the same here as on the Jobs
// list.
// In plain terms: the "where am I with this application, and when is it due"
// bar -- click a stage to set it, and set a deadline you can export to your
// calendar.

import { useState } from 'react';
import { CalendarPlus, Check, X } from 'lucide-react';
import type { ApplicationStatus, JobPosting } from '../../types';
import { deadlineCountdown, STATUS_COLORS, STATUS_LABELS, STATUSES } from '../../lib/jobStore';
import { buildDeadlineIcs } from '../../lib/ics';
import { downloadTextFile } from '../../lib/download';
import { Badge, fieldInputClass, fieldLabelClass } from '../ui/primitives';

// Background for the currently-selected status pill. Deliberately the solid,
// saturated version of the same hue STATUS_COLORS gives that status's Badge
// on the Jobs list -- the badge is a quiet label, this is a pressed button.
const ACTIVE_PILL: Record<'blue' | 'amber' | 'green' | 'red', string> = {
  blue: 'bg-blue-600 text-white dark:bg-blue-500',
  amber: 'bg-amber-500 text-white dark:bg-amber-500',
  green: 'bg-emerald-600 text-white dark:bg-emerald-500',
  red: 'bg-red-600 text-white dark:bg-red-500',
};

const NOT_APPLIED_PILL = 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900';

// Formats a ms timestamp as a YYYY-MM-DD string using LOCAL date parts, for
// an <input type="date"> value -- toISOString() converts to UTC first, which
// shifts the displayed date by a day whenever local time is ahead of UTC (a
// deadline saved as local midnight reads back as the day before).
// In plain terms: turns a saved deadline back into the date the user actually
// picked, without an off-by-one-day timezone bug.
function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Status pipeline + deadline for one posting. Owns only the transient "the
 * date picker is open" flag; every real change is handed straight to the
 * parent's autosaving update function.
 * In plain terms: the status buttons and deadline control on a job's page.
 */
export function ApplicationTracker({
  posting,
  onChange,
}: {
  posting: JobPosting;
  onChange: (patch: Partial<JobPosting>) => void;
}) {
  // Only meaningful while no deadline is set -- once one exists the date
  // input is always shown, so this flag stops mattering.
  const [picking, setPicking] = useState(false);

  // Setting the status to "applied" for the first time stamps the date, so
  // the tracker can show how long an application has been outstanding. Moving
  // on to interviewing/offer/rejected keeps the original stamp.
  function setStatus(status: ApplicationStatus | undefined) {
    onChange({
      status,
      appliedAt: status === 'applied' && !posting.appliedAt ? Date.now() : posting.appliedAt,
    });
  }

  function setDeadline(value: string) {
    onChange({ deadline: value ? new Date(`${value}T00:00:00`).getTime() : undefined });
  }

  function handleAddToCalendar() {
    if (!posting.deadline) return;
    const title = `Application deadline: ${posting.title || 'job posting'}${posting.company ? ` at ${posting.company}` : ''}`;
    const ics = buildDeadlineIcs({ uid: `deadline-${posting.id}`, deadline: posting.deadline, title });
    downloadTextFile(
      `${(posting.title || 'application').replace(/\s+/g, '_')}_deadline.ics`,
      ics,
      'text/calendar',
    );
  }

  const countdown = posting.deadline ? deadlineCountdown(posting.deadline) : null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
      <div className="flex flex-col gap-2">
        <span className={fieldLabelClass}>Application Status</span>
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 w-fit">
          {([undefined, ...STATUSES] as const).map((s) => {
            const active = (posting.status ?? undefined) === s;
            const activeClass = s === undefined ? NOT_APPLIED_PILL : ACTIVE_PILL[STATUS_COLORS[s]];
            return (
              <button
                key={s ?? 'none'}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? activeClass
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {s === undefined ? 'Not applied' : STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
        {posting.appliedAt && posting.status && (
          <span className="text-xs text-slate-400 dark:text-slate-500 inline-flex items-center gap-1.5">
            <Check size={12} />
            Applied {formatDate(posting.appliedAt)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className={fieldLabelClass}>Deadline</span>
        {posting.deadline || picking ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              autoFocus={picking && !posting.deadline}
              value={posting.deadline ? toDateInputValue(posting.deadline) : ''}
              onChange={(e) => setDeadline(e.target.value)}
              className={`${fieldInputClass} py-2`}
            />
            {countdown && <Badge color={countdown.color}>{countdown.label}</Badge>}
            {posting.deadline && (
              <button
                type="button"
                onClick={handleAddToCalendar}
                title="Download a calendar reminder (.ics)"
                className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
              >
                <CalendarPlus size={13} />
                Add to calendar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onChange({ deadline: undefined });
                setPicking(false);
              }}
              aria-label="Clear deadline"
              className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 w-fit rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs font-medium text-slate-400 dark:text-slate-500 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <CalendarPlus size={13} />
            Set deadline
          </button>
        )}
      </div>
    </div>
  );
}
