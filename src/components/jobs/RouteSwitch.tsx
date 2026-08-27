// What this file is: the segmented control that picks which of the two routes
// a posting is being worked through -- requirement matching (the original
// pipeline: extract requirements, match each to profile evidence) or the
// direct read (one pass reads the posting and picks evidence itself). Shared
// by the Analysis screen, the direct read's own screen, and Generate, so the
// choice sits in the same place and looks the same wherever it appears, and
// neither route's panel has to host a control belonging to the other.
// In plain terms: the Matching / Direct read toggle, in one place so every
// screen shows the same one.

import type { GenerationStrategy } from '../../types';

const OPTIONS: { strategy: GenerationStrategy; label: string }[] = [
  { strategy: 'matched', label: 'Matching' },
  { strategy: 'holistic', label: 'Direct read' },
];

export function RouteSwitch({
  current,
  onSelect,
  hint,
}: {
  current: GenerationStrategy;
  onSelect: (strategy: GenerationStrategy) => void;
  /** Optional line to the left of the control, explaining what switching does here. */
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {hint ?? 'Two ways to build this posting’s documents. Each keeps its own results.'}
      </p>
      <div
        role="group"
        aria-label="Build route"
        className="flex shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5"
      >
        {OPTIONS.map((option) => {
          const active = current === option.strategy;
          return (
            <button
              key={option.strategy}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(option.strategy)}
              className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-colors ${
                active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
