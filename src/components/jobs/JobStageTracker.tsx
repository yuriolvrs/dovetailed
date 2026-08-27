// What this file is: the stage-stepper shown inside one route's screens, so
// the user can see where they are and jump back to a stage they've reached.
// It shows ONE route's steps, never a fork: the choice between Matching and
// the Direct read is made on the posting hub (/jobs/:id), and by the time this
// is on screen that choice is already made. That is why the two step counts
// can differ honestly -- Matching genuinely has an extra stage (extracting the
// requirement list) and pretending otherwise would misdescribe it. Fetches its
// own "do documents exist yet" flag via genStore, so it drops into any screen
// with no extra data-plumbing.
// In plain terms: the numbered steps along the top of a job's screens, showing
// only the path you're actually on.

import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Files, Link2, ListChecks, Sparkles } from 'lucide-react';
import type { GenerationStrategy } from '../../types';
import { loadGeneration } from '../../lib/genStore';

export type StageKey = 'posting' | 'requirements' | 'matches' | 'choices' | 'documents';

const STAGE_ORDER: Record<GenerationStrategy, StageKey[]> = {
  matched: ['posting', 'requirements', 'matches', 'documents'],
  holistic: ['posting', 'choices', 'documents'],
};

const STAGE_LABEL: Record<StageKey, string> = {
  posting: 'Posting',
  requirements: 'Requirements',
  matches: 'Matches',
  choices: 'Choices',
  documents: 'Documents',
};

// Each circle carries its own stage's icon rather than a position number, so a
// step is recognisable without reading its label. Decorative -- the label next
// to it is the accessible name -- hence aria-hidden at the render site.
const STAGE_ICON: Record<StageKey, typeof FileText> = {
  posting: FileText,
  requirements: ListChecks,
  // Pairing one requirement to one piece of profile evidence.
  matches: Link2,
  // Same mark the hub gives the Direct read, so the route reads consistently.
  choices: Sparkles,
  documents: Files,
};

export function JobStageTracker({
  postingId,
  current,
  strategy,
  analysisDone,
  matchingDone,
  selectionDone = false,
  className = '',
}: {
  postingId: string;
  current: StageKey;
  /** Which route's steps to show. */
  strategy: GenerationStrategy;
  analysisDone: boolean;
  matchingDone: boolean;
  selectionDone?: boolean;
  className?: string;
}) {
  const [documentsDone, setDocumentsDone] = useState(false);

  useEffect(() => {
    loadGeneration(postingId, 'resume', strategy).then((g) => setDocumentsDone(Boolean(g)));
  }, [postingId, strategy]);

  const stages = STAGE_ORDER[strategy];
  const documentsHref = `/jobs/${postingId}/documents${strategy === 'holistic' ? '?route=direct' : ''}`;
  const routeReady = strategy === 'holistic' ? selectionDone : matchingDone;

  // The posting itself is the one stage that is always complete -- you cannot
  // reach any of this without a saved posting.
  const doneMap: Record<StageKey, boolean> = {
    posting: true,
    requirements: analysisDone,
    matches: matchingDone,
    choices: selectionDone,
    documents: documentsDone,
  };
  const hrefMap: Record<StageKey, string | null> = {
    posting: `/jobs/${postingId}`,
    requirements: `/jobs/${postingId}/match/analyze`,
    matches: analysisDone ? `/jobs/${postingId}/match` : null,
    choices: `/jobs/${postingId}/direct`,
    documents: routeReady ? documentsHref : null,
  };

  return (
    <div className={`flex items-center print:hidden ${className}`}>
      {stages.map((key, index) => {
        const isCurrent = key === current;
        const isDone = doneMap[key];
        const href = hrefMap[key];
        const reachable = isCurrent || href !== null;

        const Icon = STAGE_ICON[key];

        // Three visibly separate treatments, because the previous two were not:
        // current and done both filled slate-900, leaving only the label weight
        // to tell them apart. Now the current step is the only blue thing on
        // screen and wears a halo; done is a solid neutral fill; not-yet is a
        // hollow outline. Hue, fill and weight all move together.
        const circleClass = `flex items-center justify-center w-6 h-6 rounded-full shrink-0 transition-colors ${
          isCurrent
            ? 'bg-blue-600 text-white ring-4 ring-blue-600/20 dark:bg-blue-500 dark:ring-blue-500/25'
            : isDone
              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
              : reachable
                ? 'bg-white border border-slate-300 text-slate-500 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-400'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-600'
        }`;
        // Weight stays constant across states on purpose. Bolding only the
        // current label made that one word wider, so the bar's total width
        // changed as the current step moved and the centred stepper shifted a
        // pixel on every navigation. Hue carries the emphasis instead, which is
        // the stronger cue anyway next to the blue circle.
        const labelClass = `text-xs font-medium whitespace-nowrap ${
          isCurrent
            ? 'text-slate-900 dark:text-slate-100'
            : reachable
              ? 'text-slate-600 dark:text-slate-400'
              : 'text-slate-500 dark:text-slate-600'
        }`;

        const content = (
          <span className="flex items-center gap-1.5">
            <span className={circleClass}>
              <Icon size={13} aria-hidden />
            </span>
            <span className={labelClass}>{STAGE_LABEL[key]}</span>
          </span>
        );

        return (
          <Fragment key={key}>
            {index > 0 && (
              <span
                className={`w-4 sm:w-8 h-px mx-1.5 sm:mx-2 shrink-0 transition-colors ${
                  doneMap[stages[index - 1]] ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            )}
            {!isCurrent && href ? (
              <Link
                to={href}
                className="rounded hover:opacity-70 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {content}
              </Link>
            ) : (
              <span aria-current={isCurrent ? 'step' : undefined} className={!reachable ? 'cursor-not-allowed' : ''}>
                {content}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
