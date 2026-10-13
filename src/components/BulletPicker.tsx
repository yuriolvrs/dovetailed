// What this file is: shows the bullets from a profile entry that the
// automatic selection (selectResumeContent.ts's bullet cap, or
// fitToOnePage.ts's page-fit trimming) left out of the generated resume, so
// the user can add one back with a click instead of retyping it. Included
// bullets stay editable/removable exactly as before, via the existing
// StringList above this -- removing one there is the "exclude" half; this
// component is the "include" half.
// In plain terms: the "here's what got left out, click to bring it back"
// list under each resume entry's bullets.

import { Check, Plus } from 'lucide-react';
import { Badge } from './ui/primitives';

export function BulletPicker({
  allBullets,
  included,
  onAdd,
  bulletMatch,
}: {
  /** Every bullet on the source profile entry, not just the ones currently in the resume. */
  allBullets: string[];
  /** Bullets currently included in the generated resume for this entry. */
  included: string[];
  onAdd: (bullet: string) => void;
  /** Requirement text this bullet is matched to, or null if unmatched -- same lookup ResumeEditor already uses. */
  bulletMatch: (bulletText: string) => string | null;
}) {
  const excluded = allBullets.filter((b) => !included.includes(b));
  if (excluded.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
        Not on this resume
      </p>
      {excluded.map((bullet, i) => {
        const requirement = bulletMatch(bullet);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onAdd(bullet)}
            className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
          >
            <Plus size={14} aria-hidden className="mt-0.5 shrink-0 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100" />
            <span className="sr-only">Add: </span>
            <span className="flex-1 text-sm text-slate-600 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100">{bullet}</span>
            {requirement && (
              <span className="flex min-w-0 max-w-[50%]">
                <Badge color="green" title={`Matches: ${requirement}`}>
                  <Check size={11} />
                  <span className="truncate">Matches: {requirement}</span>
                </Badge>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
