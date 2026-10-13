// What this file is: the profile bullets of one resume entry that are not on
// the resume. The ones that fit this job are listed first and always shown,
// with the requirement they answer; the rest wait behind "N more from your
// profile". One click puts a bullet back. Included bullets are edited in the
// list above this, so removing one there is the "exclude" half and this
// component is the "include" half.
// In plain terms: the lines you left out of this job, best ones first,
// click to bring one back.

import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { FitReason } from '../lib/jobFit';
import { normalizeLine } from '../lib/jobFit';
import { FitLabel } from './resume/FitLabel';

/**
 * One left-out line: a plus, the text, and why it fits when it does.
 * In plain terms: a line you can click to put back on the resume.
 */
function PickRow({ text, reason, onAdd }: { text: string; reason: FitReason | null; onAdd: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
      >
        <Plus
          size={14}
          aria-hidden
          className="mt-0.5 shrink-0 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100"
        />
        <span className="sr-only">Add to resume: </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100">
            {text}
          </span>
          {reason && <FitLabel reason={reason} className="mt-0.5" />}
        </span>
      </button>
    </li>
  );
}

export function BulletPicker({
  allBullets,
  included,
  onAdd,
  reasonFor,
}: {
  /** Every bullet on the source profile entry, not just the ones on the resume. */
  allBullets: string[];
  /** Bullets on the resume for this entry now. */
  included: string[];
  onAdd: (bullet: string) => void;
  /** Why a line fits this job, or null -- see jobFit.ts. */
  reasonFor: (text: string) => FitReason | null;
}) {
  const [showRest, setShowRest] = useState(false);
  const onResume = new Set(included.map(normalizeLine));
  const left = allBullets.filter((b) => b.trim() !== '' && !onResume.has(normalizeLine(b)));
  if (left.length === 0) return null;

  const fitting = left.filter((b) => reasonFor(b));
  const rest = left.filter((b) => !reasonFor(b));

  return (
    <div className="mt-2 space-y-1">
      {fitting.length > 0 && (
        <div>
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">Also fits this job</p>
          <ul>
            {fitting.map((bullet) => (
              <PickRow key={bullet} text={bullet} reason={reasonFor(bullet)} onAdd={() => onAdd(bullet)} />
            ))}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={showRest}
            onClick={() => setShowRest((v) => !v)}
            className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ChevronRight size={13} aria-hidden className={`transition-transform ${showRest ? 'rotate-90' : ''}`} />
            {rest.length} more from your profile
          </button>
          {showRest && (
            <ul>
              {rest.map((bullet) => (
                <PickRow key={bullet} text={bullet} reason={null} onAdd={() => onAdd(bullet)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
