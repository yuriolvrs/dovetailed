// What this file is: the Jobs list's first-run panel, shown in place of the
// posting list while nothing is saved. Since / is the app's home, this is also
// the first screen a stranger sees, so it carries what the app does and where
// the data lives alongside the two ways in (add a posting, fill the profile).
// It borrows the shared EmptyState's dashed frame but lays its own content out
// left-aligned, with the brand mark used at size as surface rather than as an
// icon above centred text.
// In plain terms: the "nothing here yet" panel on the Jobs page, which doubles
// as the app's front door.

import { Plus, Shield } from 'lucide-react';
import { Btn } from '../ui/primitives';
import Logo from '../ui/Logo';

/**
 * The first-run panel. `onAddPosting` opens the same paste modal as the list's
 * Add button; `onSetUpProfile` navigates to the Profile page.
 * In plain terms: the panel, plus the two things its buttons do.
 */
export function JobsFirstRun({
  onAddPosting,
  onSetUpProfile,
}: {
  onAddPosting: () => void;
  onSetUpProfile: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
      {/* The mark bleeds off the right edge in the frame's own colour, so it
          reads as surface behind the copy rather than as an illustration. */}
      <Logo
        size={210}
        className="pointer-events-none absolute -right-9 top-3 hidden sm:block text-slate-100 dark:text-slate-800"
      />

      <div className="relative px-6 sm:px-12 pt-8 sm:pt-12 pb-8 sm:pb-10">
        <h2 className="max-w-xl text-2xl font-semibold tracking-tight leading-snug text-slate-900 dark:text-slate-100">
          Start with a posting, or your profile
        </h2>
        <p className="mt-3.5 max-w-lg text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Dovetailed scores a job posting against your profile, then drafts a resume and cover
          letter — every line traced back to something you wrote.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-2">
          <Btn onClick={onAddPosting}>
            <Plus size={14} />
            Add Job Posting
          </Btn>
          <Btn variant="secondary" onClick={onSetUpProfile}>
            Set up your profile
          </Btn>
        </div>
      </div>

      {/* Below the rule because it is a standing property of the app, not a
          footnote to the paragraph above it. */}
      <div className="relative border-t border-slate-100 dark:border-slate-800 px-6 sm:px-12 py-3.5 flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
        <Shield size={12} className="shrink-0" />
        <p className="text-xs">Your profile and postings stay in this browser.</p>
      </div>
    </div>
  );
}
