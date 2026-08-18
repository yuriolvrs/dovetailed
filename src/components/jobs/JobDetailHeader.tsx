// What this file is: the shared top-bar layout for the three job-detail
// flow pages (Analysis, Matching, Generate). A three-column grid keeps the
// back link pinned left, the JobStageTracker steps dead-centered, and
// page-specific action buttons pinned right, regardless of how long the
// back-link label or action list is on any given page -- so the stepper
// never drifts and buttons land in the same spot when navigating between
// stages. An optional second row (subtabs) holds in-page tab switches, like
// Generate's Resume/Cover Letter toggle.
// In plain terms: the consistent header bar (back link, step tracker,
// action buttons) reused across the Analysis/Matching/Generate screens so
// the layout doesn't jump around between them.

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { JobStageTracker } from './JobStageTracker';

export function JobDetailHeader({
  backHref,
  backLabel,
  postingId,
  current,
  analysisDone,
  matchingDone,
  actions,
  subtabs,
}: {
  backHref: string;
  backLabel: string;
  postingId: string;
  current: 'analysis' | 'matching' | 'generate';
  analysisDone: boolean;
  matchingDone: boolean;
  actions?: ReactNode;
  subtabs?: ReactNode;
}) {
  return (
    <div className="mb-5 print:hidden">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Link
          to={backHref}
          className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium w-fit"
        >
          <ArrowLeft size={15} />
          {backLabel}
        </Link>
        <JobStageTracker
          postingId={postingId}
          current={current}
          analysisDone={analysisDone}
          matchingDone={matchingDone}
        />
        <div className="flex items-center justify-end gap-2 min-h-[30px]">{actions}</div>
      </div>
      {subtabs && <div className="mt-4">{subtabs}</div>}
    </div>
  );
}
