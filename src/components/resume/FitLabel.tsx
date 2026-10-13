// What this file is: the small green "Fits: <requirement>" line shown under a
// resume line that the job asks for, cut to one line with the full text on
// hover.
// In plain terms: the note that says which part of the job a line answers.

import { Check } from 'lucide-react';
import type { FitReason } from '../../lib/jobFit';

/**
 * Says which requirement a line answers, or that the direct read picked it.
 * In plain terms: "this line fits the job, because…".
 */
export function FitLabel({ reason, className = '' }: { reason: FitReason; className?: string }) {
  const [first, ...more] = reason.requirements;
  const text = first ? `Fits: ${first}${more.length > 0 ? ` (+${more.length} more)` : ''}` : 'Picked for this job';
  const full = reason.requirements.length > 0 ? `Fits: ${reason.requirements.join('; ')}` : text;
  return (
    <span
      title={full}
      className={`flex min-w-0 items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 ${className}`}
    >
      <Check size={12} aria-hidden className="shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
