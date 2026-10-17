// What this file is: one editable cover letter paragraph with its citations
// drawn inline. A transparent layer over the text field repeats the text
// with marks: a blue underline on sentences that cite the profile, an amber
// wash on claims with no evidence. Under the field, the sentence holding
// the cursor shows the profile lines it cites (or why it needs a check),
// beside the paragraph's own buttons: Reword, move, remove.
// In plain terms: a paragraph you can type in that also shows which
// sentences your profile backs up and which you should check.

import { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Sparkles, Trash2 } from 'lucide-react';
import type { ProfileAtom, SourceMapEntry } from '../../types';
import { citeParagraph, type CitedSpan } from '../../lib/coverLetterCitations';
import {
  PARAGRAPH_REWORD_GOALS,
  buildRewordParagraphPrompt,
  filterSafeParagraphSuggestions,
  isRewriteSuggestions,
  type ParagraphRewordGoal,
} from '../../prompts/suggestBulletRewrite';
import { generateStructured } from '../../lib/llm';
import { dropUnsupportedRewords } from '../../lib/generation/verifyClaims';
import { AutoGrowTextarea } from '../StringList';
import { IconBtn } from '../resume/ResumeEntryBlock';
import { RewordPanel } from '../resume/BulletRewriteSuggest';

// The field and the marks layer share every metric, so the marks land
// exactly under the words they belong to. The sentence holding the cursor
// gets a tint, so it is clear which one the note below describes.
const textMetrics = 'block w-full rounded-lg border px-2 py-1.5 text-[15px] leading-relaxed';

const markClass: Record<CitedSpan['status'], string> = {
  cited: 'underline decoration-blue-500/60 decoration-2 underline-offset-[5px] dark:decoration-blue-400/70',
  flagged: 'rounded-sm bg-amber-300/40 [box-decoration-break:clone] dark:bg-amber-400/25',
  plain: '',
  edited: '',
  space: '',
};

/**
 * Asks the AI for safe rewordings of one paragraph. Returns only the ones
 * that add no new name or figure.
 * In plain terms: one AI call that returns other ways to say a paragraph.
 */
async function requestParagraphRewording(text: string, goal: ParagraphRewordGoal): Promise<string[]> {
  const result = await generateStructured(buildRewordParagraphPrompt(text, goal), isRewriteSuggestions, {
    temperature: 0.5,
    // A reasoning model thinks before it answers; a paragraph needs room.
    maxTokens: 2000,
  });
  return dropUnsupportedRewords(text, filterSafeParagraphSuggestions(text, result.suggestions));
}

/**
 * The note under a paragraph: the cursor's sentence and its evidence while
 * editing, a one-line count otherwise.
 * In plain terms: tells you what backs up the sentence you're on.
 */
function EvidenceNote({
  spans,
  active,
  atomsById,
}: {
  spans: CitedSpan[];
  active: CitedSpan | null;
  atomsById: Map<string, ProfileAtom>;
}) {
  if (active) {
    if (active.status === 'cited' && active.entry) {
      const atoms = active.entry.atomIds.map((id) => atomsById.get(id)).filter((a): a is ProfileAtom => Boolean(a));
      return (
        <div className="text-xs">
          <p className="mb-1 flex items-center gap-1 font-medium text-blue-800 dark:text-blue-300">
            <Check size={12} aria-hidden />
            This sentence cites
          </p>
          <ul className="space-y-1">
            {atoms.map((atom) => (
              <li key={atom.id} className="text-slate-700 dark:text-slate-300">
                “{atom.text}”
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  {atom.sourceLabel.replace(/^(Experience|Project|Skills|Education): /, '')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    const message =
      active.status === 'flagged'
        ? active.entry && active.entry.atomIds.length > 0
          ? 'This sentence goes beyond the profile lines it cites. Check that it is true, or rewrite it.'
          : 'No profile line backs this claim. Check that it is true, or rewrite it.'
        : active.status === 'edited'
          ? 'Your own wording. It is not checked against your profile.'
          : 'No claim here, so it needs no evidence.';
    return (
      <p
        className={`flex items-start gap-1 text-xs ${
          active.status === 'flagged' ? 'text-amber-800 dark:text-amber-300' : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {active.status === 'flagged' && <AlertTriangle size={12} aria-hidden className="mt-px shrink-0" />}
        {message}
      </p>
    );
  }

  const cited = new Set(spans.flatMap((s) => (s.status === 'cited' && s.entry ? s.entry.atomIds : []))).size;
  const flagged = spans.filter((s) => s.status === 'flagged').length;
  if (flagged > 0) {
    return (
      <p className="flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle size={12} aria-hidden />
        {flagged === 1 ? '1 sentence needs' : `${flagged} sentences need`} checking
      </p>
    );
  }
  if (cited > 0) {
    return (
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Cites {cited} profile {cited === 1 ? 'line' : 'lines'}. Click a sentence to see them.
      </p>
    );
  }
  return null;
}

export function CitedParagraph({
  index,
  text,
  sourceMap,
  isLast,
  context,
  atomsById,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onFocus,
  onBlur,
}: {
  index: number;
  text: string;
  sourceMap: SourceMapEntry[];
  isLast: boolean;
  /** Posting, role, company and name: a "no claim" sentence naming only these isn't flagged. */
  context: string;
  atomsById: Map<string, ProfileAtom>;
  /** `reworded` marks a change that came from the AI reword panel. */
  onChange: (next: string, reworded?: boolean) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const [caret, setCaret] = useState<number | null>(null);
  const [rewording, setRewording] = useState(false);
  const spans = citeParagraph(text, sourceMap, { isLast, context });
  const active =
    caret === null
      ? null
      : (spans.find((s) => s.status !== 'space' && caret >= s.start && caret <= s.end) ?? null);

  return (
    <div data-index={index} className="group scroll-mt-24 rounded-xl transition-colors">
      <div className="relative">
        <AutoGrowTextarea
          rows={2}
          value={text}
          aria-label={`Paragraph ${index + 1}`}
          placeholder="Write a paragraph"
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onFocus={(e) => {
            setCaret(e.currentTarget.selectionStart);
            onFocus();
          }}
          onBlur={() => {
            setCaret(null);
            onBlur();
          }}
          className={`${textMetrics} border-transparent bg-transparent text-slate-900 placeholder:text-slate-400 transition-colors hover:bg-slate-900/[0.03] focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/25 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:bg-white/[0.03] dark:focus:border-blue-500 dark:focus:bg-slate-950`}
        />
        <div
          aria-hidden
          className={`${textMetrics} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words border-transparent text-transparent`}
        >
          {spans.map((span) => (
            <span
              key={span.start}
              className={`${markClass[span.status]} ${
                span === active && span.status !== 'flagged'
                  ? 'rounded-sm bg-blue-500/10 [box-decoration-break:clone] dark:bg-blue-400/15'
                  : ''
              }`}
            >
              {span.text}
            </span>
          ))}
          {/* Keeps a trailing newline's line box, as the field has one. */}
          {'​'}
        </div>
      </div>

      <div className="flex min-h-8 items-start gap-3 px-2 pt-1">
        <div className="min-w-0 flex-1" aria-live="polite">
          <EvidenceNote spans={spans} active={active} atomsById={atomsById} />
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {text.trim() !== '' && (
            <IconBtn label="Reword with AI" onClick={() => setRewording((v) => !v)} pressed={rewording}>
              <Sparkles size={14} />
            </IconBtn>
          )}
          <IconBtn label="Move up" onClick={() => onMoveUp?.()} disabled={!onMoveUp}>
            <ArrowUp size={14} />
          </IconBtn>
          <IconBtn label="Move down" onClick={() => onMoveDown?.()} disabled={!onMoveDown}>
            <ArrowDown size={14} />
          </IconBtn>
          <IconBtn label="Remove paragraph" onClick={onRemove}>
            <Trash2 size={14} />
          </IconBtn>
        </div>
      </div>

      {rewording && (
        <div className="px-2">
          <RewordPanel
            text={text}
            goals={PARAGRAPH_REWORD_GOALS}
            request={(goal) => requestParagraphRewording(text, goal)}
            onApply={(next) => onChange(next, true)}
            onClose={() => setRewording(false)}
            errorLabel="Rewording the paragraph"
            note="Only reuses what this paragraph already says. Suggestions that add a name or number are dropped. The citations of the original carry over."
          />
        </div>
      )}
    </div>
  );
}
