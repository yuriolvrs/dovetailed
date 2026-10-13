// What this file is: the opt-in AI rewording UI. RewordPanel is the shared
// panel: goal buttons ("Shorter", "Stronger verb", ...), the suggestions
// with the words they change marked, Use, and Undo after use. Every
// suggestion has already passed suggestBulletRewrite.ts's name-and-number
// filter before it is shown, and nothing is applied without a click.
// BulletRewriteSuggest wraps the panel with its own trigger, for the
// Profile page's bullets; the resume and cover letter editors open the
// panel from their own row toolbars.
// In plain terms: ask the AI for a few other ways to phrase one line, pick
// one or ignore them all, and take it back if you change your mind.

import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  BULLET_REWORD_GOALS,
  buildSuggestBulletRewritePrompt,
  filterSafeSuggestions,
  isRewriteSuggestions,
  type BulletRewordGoal,
} from '../../prompts/suggestBulletRewrite';
import { generateStructured, llmErrorMessage } from '../../lib/llm';
import { Btn, Skeleton } from '../ui/primitives';

/**
 * Asks the AI for safe rewordings of one bullet toward a goal. Returns only
 * suggestions that add no new name or number.
 * In plain terms: one AI call that returns other ways to say a bullet.
 */
export async function requestBulletRewording(
  text: string,
  goal: BulletRewordGoal,
  postingTerms: string[] = [],
): Promise<string[]> {
  const prompt = buildSuggestBulletRewritePrompt(text, { goal, postingTerms });
  // See runMatching.ts's comment on the same budget: the reasoning model's
  // own thinking can use several hundred tokens before it answers.
  const result = await generateStructured(prompt, isRewriteSuggestions, { temperature: 0.4, maxTokens: 900 });
  return filterSafeSuggestions(text, result.suggestions);
}

/**
 * A suggestion with each word the original doesn't contain marked, so the
 * change is visible at a glance.
 * In plain terms: shows which words the AI changed.
 */
function MarkedSuggestion({ original, suggestion }: { original: string; suggestion: string }) {
  const known = new Set(original.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? []);
  return (
    <>
      {suggestion.split(/(\s+)/).map((part, i) => {
        const word = part.toLowerCase().match(/[\p{L}\p{N}'’-]+/u)?.[0];
        return word && !known.has(word) ? (
          <span key={i} className="rounded-sm bg-blue-100/80 text-blue-950 dark:bg-blue-400/20 dark:text-blue-50">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

type PanelState =
  | { kind: 'loading' }
  | { kind: 'shown'; suggestions: string[] }
  | { kind: 'error'; message: string }
  | { kind: 'applied'; previous: string };

/**
 * The rewording panel under one line. Fetches suggestions for the first goal
 * as soon as it opens; picking another goal fetches again.
 * In plain terms: the box that shows the AI's alternative wordings.
 */
export function RewordPanel<G extends string>({
  text,
  goals,
  request,
  onApply,
  onClose,
  errorLabel = 'Suggesting a rewording',
  note = 'Only reuses what this line already says. Suggestions that add a name or number are dropped.',
}: {
  text: string;
  goals: { id: G; label: string }[];
  request: (goal: G) => Promise<string[]>;
  onApply: (next: string) => void;
  onClose: () => void;
  errorLabel?: string;
  note?: string;
}) {
  const [goal, setGoal] = useState<G>(goals[0].id);
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  // Answers for an older goal, or for a panel already closed, are ignored.
  const requestId = useRef(0);

  async function load(next: G) {
    const id = ++requestId.current;
    setGoal(next);
    setState({ kind: 'loading' });
    try {
      const suggestions = await request(next);
      if (id === requestId.current) setState({ kind: 'shown', suggestions });
    } catch (err) {
      if (id === requestId.current) setState({ kind: 'error', message: llmErrorMessage(err, errorLabel) });
    }
  }

  useEffect(() => {
    void load(goals[0].id);
    return () => {
      requestId.current++;
    };
    // Runs once per opening; goal changes go through load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="region"
      aria-label="AI rewording"
      className="mt-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-950/60 dark:ring-slate-800"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles size={13} aria-hidden className="mr-0.5 text-blue-600 dark:text-blue-400" />
        {state.kind === 'applied' ? (
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">New wording applied.</span>
        ) : (
          <div role="radiogroup" aria-label="Rewording goal" className="flex flex-wrap gap-1">
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={goal === g.id}
                onClick={() => goal !== g.id && void load(g.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  goal === g.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        {state.kind === 'applied' && (
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              onApply(state.previous);
              onClose();
            }}
          >
            <RotateCcw size={12} />
            Undo
          </Btn>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close rewording"
          className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <X size={14} />
        </button>
      </div>

      <div aria-live="polite" className="mt-2">
        {state.kind === 'loading' && (
          <div className="space-y-2 py-1" aria-label="Writing suggestions">
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        )}
        {state.kind === 'error' && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-red-600 dark:text-red-400">{state.message}</p>
            <Btn size="sm" variant="secondary" onClick={() => void load(goal)}>
              Try again
            </Btn>
          </div>
        )}
        {state.kind === 'shown' && state.suggestions.length === 0 && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Nothing to suggest for this goal without adding something new. Try another goal.
          </p>
        )}
        {state.kind === 'shown' && state.suggestions.length > 0 && (
          <ul className="space-y-1">
            {state.suggestions.map((suggestion, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    setState({ kind: 'applied', previous: text });
                    onApply(suggestion);
                  }}
                  className="group flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left text-sm leading-relaxed text-slate-700 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  <span className="min-w-0 flex-1">
                    <MarkedSuggestion original={text} suggestion={suggestion} />
                  </span>
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-blue-700 group-hover:bg-blue-50 dark:text-blue-300 dark:group-hover:bg-blue-500/10">
                    <Check size={12} />
                    Use
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {state.kind !== 'applied' && (
          <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{note}</p>
        )}
      </div>
    </div>
  );
}

/**
 * "Reword" under a Profile page bullet: a quiet trigger that opens the panel.
 * In plain terms: the reword button on your profile's bullets.
 */
export function BulletRewriteSuggest({
  bulletText,
  onApply,
}: {
  bulletText: string;
  onApply: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <RewordPanel
        text={bulletText}
        goals={BULLET_REWORD_GOALS.filter((g) => g.id !== 'posting')}
        request={(goal) => requestBulletRewording(bulletText, goal)}
        onApply={onApply}
        onClose={() => setOpen(false)}
      />
    );
  }

  // Nothing to reword in an empty bullet, so no button for it.
  if (bulletText.trim() === '') return null;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
    >
      <Sparkles size={12} />
      Suggest rewording
    </button>
  );
}
