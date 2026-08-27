// What this file is: the shared top bar for a posting's route screens
// (requirements, matches, choices, documents) -- back link pinned left, the
// JobStageTracker centred, and page-specific actions pinned right, so the
// stepper never drifts and buttons land in the same spot when moving between
// stages. An optional second row (subtabs) holds in-page tab switches, like
// Documents' Resume/Cover Letter toggle.
//
// Layout is two-tier on purpose. Wide viewports get the three-column grid that
// keeps the stepper optically centred regardless of how long the back label or
// action list is. Narrow ones cannot: back link + stepper + actions on one line
// overflowed the viewport by hundreds of pixels (measured at 390px wide), so
// below `sm` the stepper drops to its own row and scrolls within itself rather
// than pushing the page sideways.
// In plain terms: the consistent header bar across a job's screens, which
// stacks instead of overflowing on a phone.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { GenerationStrategy } from '../../types';
import { JobStageTracker, type StageKey } from './JobStageTracker';

export function JobDetailHeader({
  backHref,
  backLabel,
  postingId,
  current,
  strategy,
  analysisDone,
  matchingDone,
  selectionDone,
  actions,
  subtabs,
}: {
  backHref: string;
  backLabel: string;
  postingId: string;
  current: StageKey;
  /** Which route's steps the stepper shows. Required -- the stepper only ever renders one route. */
  strategy: GenerationStrategy;
  analysisDone: boolean;
  matchingDone: boolean;
  selectionDone?: boolean;
  actions?: ReactNode;
  subtabs?: ReactNode;
}) {
  return (
    <div className="mb-5 print:hidden">
      {/* The stepper gets its own row at every width, rather than sharing one
          with the back link and the actions. Sharing was the whole cause of the
          drift: whichever way it is centred between two siblings, it is centred
          in the space THEY leave over, and both differ per stage -- the back
          label is longer on some screens, and Documents carries three action
          buttons where Requirements carries none. So the stepper moved on every
          navigation. Three-column grids do not save it either: sized `1fr` the
          wide action set grows its own track and shoves the centre 73px across,
          and sized `minmax(0,1fr)` the actions wrap instead and the header
          jumps from 32px tall to 70px, which trades sideways movement for
          vertical. On its own row it is centred in the full width and cannot be
          reached by either neighbour. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link
            to={backHref}
            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium w-fit rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
          {/* min-w-0 so this can shrink below its content width -- without it a
              flex item stays at max-content, the inner flex-wrap never engages,
              and Documents' three buttons pushed the page 86px sideways at
              390px. min-h matches a small Btn exactly, so a screen with no
              actions is the same height as one with them. */}
          <div className="flex min-h-[32px] min-w-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        </div>

        {/* w-max + mx-auto centres the stepper while it fits and falls back to
            left-aligned scrolling when it does not, since auto margins collapse
            to zero once there is no free space.

            py-1.5 is load-bearing, not spacing: `overflow-x-auto` makes the
            OTHER axis compute to `auto` too, so this box clips vertically as
            well. Without the padding it is exactly as tall as the 24px step
            circles, and the current step's 4px halo ring was sliced off top and
            bottom. */}
        <div className="overflow-x-auto py-1.5">
          <JobStageTracker
            postingId={postingId}
            current={current}
            strategy={strategy}
            analysisDone={analysisDone}
            matchingDone={matchingDone}
            selectionDone={selectionDone}
            className="w-max mx-auto"
          />
        </div>
      </div>
      {subtabs && <div className="mt-4">{subtabs}</div>}
    </div>
  );
}
