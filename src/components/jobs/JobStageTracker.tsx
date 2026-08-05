// What this file is: a shared stage-stepper (Analysis / Matching /
// Generate) shown at the top of the Job Detail, Matching review, and
// Generate pages, so the user always sees where they are in one posting's
// flow and can jump directly to any stage they've already reached. Generate
// covers both the resume and cover letter (a tab switch within that page,
// not a separate stage) since they're generated from the same matched
// requirements. Fetches its own "does a resume exist yet" flag (the one
// piece its callers don't already have in state) via genStore, so it can be
// dropped into any of the three pages with no extra data-plumbing.
// In plain terms: the numbered steps (Analysis, Matching, Generate) shown
// above a job's detail screens, so you can see and jump between stages.

import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { loadGeneration } from '../../lib/genStore';

type StageKey = 'analysis' | 'matching' | 'generate';

const STAGE_ORDER: StageKey[] = ['analysis', 'matching', 'generate'];

const STAGE_LABEL: Record<StageKey, string> = {
  analysis: 'Analysis',
  matching: 'Matching',
  generate: 'Generate',
};

export function JobStageTracker({
  postingId,
  current,
  analysisDone,
  matchingDone,
  className = '',
}: {
  postingId: string;
  current: StageKey;
  analysisDone: boolean;
  matchingDone: boolean;
  className?: string;
}) {
  const [generateDone, setGenerateDone] = useState(false);

  useEffect(() => {
    loadGeneration(postingId, 'resume').then((g) => setGenerateDone(Boolean(g)));
  }, [postingId]);

  const doneMap: Record<StageKey, boolean> = {
    analysis: analysisDone,
    matching: matchingDone,
    generate: generateDone,
  };
  const hrefMap: Record<StageKey, string | null> = {
    analysis: `/jobs/${postingId}`,
    matching: analysisDone ? `/jobs/${postingId}/match` : null,
    generate: matchingDone ? `/jobs/${postingId}/generate` : null,
  };

  return (
    <div className={`flex items-center print:hidden ${className}`}>
      {STAGE_ORDER.map((key, index) => {
        const isCurrent = key === current;
        const isDone = doneMap[key];
        const href = hrefMap[key];
        const reachable = isCurrent || href !== null;

        const circleClass = `flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold shrink-0 transition-colors ${
          isCurrent || isDone
            ? 'bg-slate-900 text-white'
            : reachable
              ? 'bg-white border border-slate-300 text-slate-500'
              : 'bg-slate-50 text-slate-300'
        }`;
        const labelClass = `text-xs font-medium whitespace-nowrap ${
          isCurrent ? 'text-slate-900' : reachable ? 'text-slate-500' : 'text-slate-300'
        }`;

        const content = (
          <span className="flex items-center gap-1.5">
            <span className={circleClass}>{isDone && !isCurrent ? <Check size={12} /> : index + 1}</span>
            <span className={labelClass}>{STAGE_LABEL[key]}</span>
          </span>
        );

        return (
          <Fragment key={key}>
            {index > 0 && (
              <span
                className={`w-6 sm:w-10 h-px mx-2 shrink-0 transition-colors ${
                  doneMap[STAGE_ORDER[index - 1]] ? 'bg-slate-900' : 'bg-slate-200'
                }`}
              />
            )}
            {!isCurrent && href ? (
              <Link to={href} className="hover:opacity-70 transition-opacity">
                {content}
              </Link>
            ) : (
              <span className={!reachable ? 'cursor-not-allowed' : ''}>{content}</span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
