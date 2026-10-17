// What this file is: the opt-in "Suggest a summary for this job" action under
// the resume editor's summary field. It opens the shared RewordPanel with
// summary drafts that already passed the claim check; Use puts one in the
// summary, Undo puts the old text back. The AI is called only after the click.
// In plain terms: a button that offers a couple of summary ideas for this job
// built from your real profile, which you can take or ignore.

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { requestSummarySuggestions } from '../../lib/generation/suggestSummary';
import { RewordPanel } from './BulletRewriteSuggest';

const GOALS = [{ id: 'job', label: 'For this job' }];

export function SuggestSummary({
  summary,
  role,
  lines,
  onApply,
}: {
  /** The summary now, so Undo can restore it. */
  summary: string;
  /** The posting's role summary. */
  role: string;
  /** The profile lines the drafts may use and are checked against. */
  lines: string[];
  onApply: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="mb-5">
        <RewordPanel
          text={summary}
          goals={GOALS}
          request={() => requestSummarySuggestions(role, lines)}
          onApply={onApply}
          onClose={() => setOpen(false)}
          errorLabel="Suggesting a summary"
          note="Built only from your profile lines. Drafts that say more than those lines are dropped."
        />
      </div>
    );
  }

  // Without matched lines there is nothing true to build a summary from.
  if (lines.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mb-5 flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <Sparkles size={12} />
      Suggest a summary for this job
    </button>
  );
}
