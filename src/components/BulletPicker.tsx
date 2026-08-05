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
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Not included</p>
      {excluded.map((bullet, i) => {
        const requirement = bulletMatch(bullet);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onAdd(bullet)}
            className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <Plus size={13} className="shrink-0 text-slate-400" />
            <span className="flex-1 text-sm text-slate-500">{bullet}</span>
            {requirement && (
              <Badge color="green">
                <Check size={11} />
                Matched
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
