// What this file is: the status panel at the top of the resume editor. Its
// header line says whether the resume fits on one page and how many of the
// posting's requirements it covers. Open by default, it lists every requirement: the
// line that covers it, or the profile lines that could (one click adds one),
// or that nothing in the profile does. On the direct route there is no
// requirement list, so it reports the AI's picks instead.
// In plain terms: how well this resume answers the job, and a quick way to
// add the lines that would answer more of it.

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Circle, Minus, Plus } from 'lucide-react';
import type { ProfileAtom } from '../../types';
import type { RequirementCoverage } from '../../lib/jobFit';
import { Card } from '../ui/primitives';

/**
 * One requirement's row: status icon, the requirement, then what covers it
 * or what could.
 * In plain terms: one line of the job's wish list and how you meet it.
 */
function RequirementRow({ item, onAdd }: { item: RequirementCoverage; onAdd: (atom: ProfileAtom) => void }) {
  const icon =
    item.status === 'onResume' ? (
      <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
    ) : item.status === 'inProfile' ? (
      <Circle size={12} className="m-px text-amber-600 dark:text-amber-400" />
    ) : (
      <Minus size={14} className="text-slate-400 dark:text-slate-500" />
    );
  return (
    <li className="flex gap-2.5 py-2.5">
      <span aria-hidden className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800 dark:text-slate-200">
          {item.requirement.text}
          {item.requirement.severity === 'required' && (
            <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">Required</span>
          )}
        </p>
        {item.status === 'onResume' && (
          <p className="truncate text-xs text-slate-500 dark:text-slate-400" title={item.onResume[0].text}>
            <span className="sr-only">Covered by: </span>“{item.onResume[0].text}”
          </p>
        )}
        {item.status === 'inProfile' && item.addable.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {item.addable.slice(0, 3).map((atom) => (
              <li key={atom.id}>
                <button
                  type="button"
                  onClick={() => onAdd(atom)}
                  className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-xs text-slate-700 transition-colors hover:bg-slate-900/[0.04] hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 dark:text-slate-300 dark:hover:bg-white/[0.04] dark:hover:text-slate-100"
                >
                  <Plus size={13} aria-hidden className="mt-px shrink-0 text-amber-700 dark:text-amber-400" />
                  <span className="min-w-0">
                    <span className="sr-only">Add to resume: </span>
                    {atom.text}
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      {atom.sourceLabel.replace(/^(Experience|Project|Skills): /, '')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {item.status === 'inProfile' && item.addable.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Only in your profile notes, which don't print. Add it to a job or project to use it.
          </p>
        )}
        {item.status === 'gap' && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Nothing in your profile covers this yet.</p>
        )}
      </div>
    </li>
  );
}

export function JobFitPanel({
  coverage,
  pickedCount,
  pickedOnResume,
  fitsOnePage,
  onAdd,
}: {
  /** Matched route: requirement coverage. Empty on the direct route. */
  coverage: RequirementCoverage[];
  /** Direct route: how many lines the AI picked, and how many are on the resume. */
  pickedCount: number;
  pickedOnResume: number;
  /** Null until the page fit has been measured. */
  fitsOnePage: boolean | null;
  onAdd: (atom: ProfileAtom) => void;
}) {
  const covered = coverage.filter((c) => c.status === 'onResume').length;
  const addable = coverage.filter((c) => c.status === 'inProfile' && c.addable.length > 0).length;
  const hasList = coverage.length > 0;
  // Open by default, so the recommendations are visible without a click.
  const [open, setOpen] = useState(hasList);

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        {fitsOnePage !== null && (
          <p
            aria-live="polite"
            className={`flex items-center gap-1.5 text-sm font-medium ${
              fitsOnePage ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {fitsOnePage ? <Check size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
            {fitsOnePage ? 'Fits on one page' : 'Runs past one page'}
          </p>
        )}
        {hasList ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="job-fit-list"
            onClick={() => setOpen((v) => !v)}
            className="-mx-2 flex flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-slate-900/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-white/[0.04]"
          >
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Covers {covered} of {coverage.length}
              </span>{' '}
              requirements
              {addable > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {' '}
                  · {addable} more can be added
                </span>
              )}
            </span>
            <ChevronDown
              size={16}
              aria-hidden
              className={`shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          pickedCount > 0 && (
            <p className="text-sm text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {pickedOnResume} of {pickedCount}
              </span>{' '}
              lines the AI picked for this job are on the resume
            </p>
          )
        )}
      </div>
      {hasList && open && (
        <ul
          id="job-fit-list"
          className="divide-y divide-slate-100 border-t border-slate-200 px-4 dark:divide-slate-800 dark:border-slate-800 sm:px-5"
        >
          {coverage.map((item) => (
            <RequirementRow key={item.requirement.id} item={item} onAdd={onAdd} />
          ))}
        </ul>
      )}
    </Card>
  );
}
