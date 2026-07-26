// What this file is: a shared stage-tracker strip (Analysis / Matching /
// Generate) shown at the top of the Job Detail, Matching review, and
// Generate pages, so the user always sees where they are in one posting's
// flow and can jump directly to any stage they've already reached. Generate
// covers both the resume and cover letter (a tab switch within that page,
// not a separate stage) since they're generated from the same matched
// requirements. Fetches its own "does a resume exist yet" flag (the one
// piece its callers don't already have in state) via genStore, so it can be
// dropped into any of the three pages with no extra data-plumbing.
// In plain terms: the row of steps (Analysis, Matching, Generate) shown
// above a job's detail screens, so you can see and jump between stages.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { loadGeneration } from '../../lib/genStore';

type StageKey = 'analysis' | 'matching' | 'generate';

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
  className = 'mb-4',
}: {
  postingId: string;
  current: StageKey;
  analysisDone: boolean;
  matchingDone: boolean;
  /** Overrides the tracker's own default bottom margin -- pass '' when a caller lays it out inline with other header elements instead of stacking it above them. */
  className?: string;
}) {
  const [generateDone, setGenerateDone] = useState(false);

  useEffect(() => {
    loadGeneration(postingId, 'resume').then((g) => setGenerateDone(Boolean(g)));
  }, [postingId]);

  const stages: { key: StageKey; done: boolean; href: string | null }[] = [
    { key: 'analysis', done: analysisDone, href: `/jobs/${postingId}` },
    { key: 'matching', done: matchingDone, href: analysisDone ? `/jobs/${postingId}/match` : null },
    { key: 'generate', done: generateDone, href: matchingDone ? `/jobs/${postingId}/generate` : null },
  ];

  return (
    <div className={`flex items-center gap-1.5 print:hidden ${className}`}>
      {stages.map((stage) => {
        const isCurrent = stage.key === current;
        const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors';
        if (isCurrent) {
          return (
            <span key={stage.key} className={`${base} bg-slate-900 text-white`}>
              {STAGE_LABEL[stage.key]}
            </span>
          );
        }
        if (stage.href) {
          return (
            <Link
              key={stage.key}
              to={stage.href}
              className={`${base} bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900`}
            >
              {stage.done && <Check size={11} />}
              {STAGE_LABEL[stage.key]}
            </Link>
          );
        }
        return (
          <span key={stage.key} className={`${base} bg-slate-50 text-slate-300 cursor-not-allowed`}>
            {STAGE_LABEL[stage.key]}
          </span>
        );
      })}
    </div>
  );
}
