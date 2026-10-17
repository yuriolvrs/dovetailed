// What this file is: the editor for a generated cover letter. It reads like
// the letter: greeting, paragraphs, closing. Each paragraph (CitedParagraph)
// marks its sentences inline -- underlined where they cite the profile,
// amber where a claim has no evidence -- per CLAUDE.md's "UI flags
// unevidenced claims" rule, and the sentence under the cursor shows the
// profile lines behind it. A summary at the top counts what needs checking.
// Paragraphs can be reworded with AI (citations carry over, see
// carryCitations), moved, removed and added. Text the user changes by hand
// is theirs: it shows no citation. A click in the live preview
// (CoverLetterPrintView's onNavigate) scrolls to and focuses that field.
// In plain terms: the screen where you review and tweak a generated cover
// letter, seeing which sentences your profile backs up and which to check.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Plus, RotateCcw } from 'lucide-react';
import type { CoverLetterContent, Profile, SourceMapEntry } from '../../types';
import type { CoverLetterNavTarget } from './coverLetterNav';
import { buildProfileAtoms } from '../../lib/profileAtoms';
import { carryCitations, citeParagraph } from '../../lib/coverLetterCitations';
import { Btn, Card, FieldInput } from '../ui/primitives';
import { CitedParagraph } from './CitedParagraph';

const FLASH = ['ring-2', 'ring-amber-300', 'dark:ring-amber-500/60'];

/**
 * Briefly rings an element, so the eye finds what a preview click opened.
 * In plain terms: a short highlight on the field you jumped to.
 */
function flash(el: Element | null | undefined) {
  if (!el) return;
  el.classList.add(...FLASH);
  setTimeout(() => el.classList.remove(...FLASH), 1500);
}

export function CoverLetterEditor({
  value,
  sourceMap,
  profile,
  onChange,
  onFocusParagraph,
  navRequest,
  closingContext,
}: {
  value: CoverLetterContent;
  sourceMap: SourceMapEntry[];
  /** Source of the profile lines the sourceMap points to. */
  profile: Profile;
  /** A new sourceMap comes along only when an AI rewording changed it. */
  onChange: (content: CoverLetterContent, sourceMap?: SourceMapEntry[]) => void;
  /** Reports a paragraph gaining focus (index) or losing it (null), so the live preview can highlight it. */
  onFocusParagraph: (index: number | null) => void;
  /** A field clicked in the live preview, to scroll to and focus here. */
  navRequest?: { target: CoverLetterNavTarget; nonce: number } | null;
  /** Posting text, role, company and candidate name: a sentence naming nothing beyond these needs no evidence. */
  closingContext?: string;
}) {
  const atomsById = useMemo(() => new Map(buildProfileAtoms(profile).map((a) => [a.id, a])), [profile]);
  const context = closingContext ?? '';
  const containerRef = useRef<HTMLDivElement>(null);
  // The sourceMap from before the last AI rewording, so its Undo restores
  // the citations along with the text.
  const lastReword = useRef<{ index: number; before: string; sourceMap: SourceMapEntry[] } | null>(null);
  const [removed, setRemoved] = useState<{ index: number; text: string } | null>(null);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(timer);
  }, [removed]);

  useEffect(() => {
    if (!navRequest) return;
    const { target } = navRequest;
    const timer = setTimeout(() => {
      const root = containerRef.current;
      const el =
        target.section === 'paragraph'
          ? root?.querySelector(`[data-index="${target.index}"]`)
          : root?.querySelector(`[data-field="${target.section}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('textarea, input')?.focus({ preventScroll: true });
      flash(el);
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  const isLast = (i: number) => i === value.paragraphs.length - 1;
  const allSpans = value.paragraphs.flatMap((p, i) => citeParagraph(p, sourceMap, { isLast: isLast(i), context }));
  const flagged = allSpans.filter((s) => s.status === 'flagged').length;
  const cited = allSpans.filter((s) => s.status === 'cited').length;

  function setParagraphs(paragraphs: string[], nextMap?: SourceMapEntry[]) {
    onChange({ ...value, paragraphs }, nextMap);
  }

  /**
   * Applies a paragraph change. An AI rewording carries the old citations
   * onto the new text; its Undo (the panel hands back the old text) puts the
   * old sourceMap back as it was.
   * In plain terms: saves a paragraph edit and keeps its evidence right.
   */
  function changeParagraph(index: number, next: string, reworded = false) {
    const paragraphs = value.paragraphs.map((p, i) => (i === index ? next : p));
    if (!reworded) {
      setParagraphs(paragraphs);
      return;
    }
    const undo = lastReword.current;
    if (undo && undo.index === index && undo.before === next) {
      lastReword.current = null;
      setParagraphs(paragraphs, undo.sourceMap);
      return;
    }
    const before = value.paragraphs[index];
    lastReword.current = { index, before, sourceMap };
    setParagraphs(paragraphs, carryCitations(sourceMap, before, next, { isLast: isLast(index), context }));
  }

  function move(index: number, to: number) {
    const paragraphs = value.paragraphs.slice();
    [paragraphs[index], paragraphs[to]] = [paragraphs[to], paragraphs[index]];
    setParagraphs(paragraphs);
  }

  return (
    <div ref={containerRef}>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
          {flagged > 0 ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle size={15} aria-hidden />
              {flagged === 1 ? '1 sentence makes a claim' : `${flagged} sentences make claims`} your profile doesn't
              back
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <Check size={15} aria-hidden />
              {sourceMap.some((e) => e.atomIds.length > 0) &&
              sourceMap.every((e) => e.atomIds.length === 0 || e.claim === false || e.supported === true)
                ? 'Every claim checked against your profile'
                : 'Every claim cites your profile'}
            </p>
          )}
          <p className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
            {cited > 0 && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-4 rounded-full bg-blue-500/70 dark:bg-blue-400/70" />
                Cites your profile
              </span>
            )}
            {flagged > 0 && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-4 rounded-sm bg-amber-300/60 dark:bg-amber-400/30" />
                Check before sending
              </span>
            )}
          </p>
        </div>

        <div className="space-y-4 px-2 py-5 sm:px-4">
          <div data-field="greeting" className="rounded-lg px-2">
            <FieldInput
              label="Greeting"
              flat
              className="[&>input]:-mx-2"
              value={value.greeting}
              onChange={(greeting) => onChange({ ...value, greeting })}
            />
          </div>

          <div role="group" aria-label="Paragraphs" className="space-y-2">
            {value.paragraphs.map((paragraph, index) => (
              <CitedParagraph
                key={index}
                index={index}
                text={paragraph}
                sourceMap={sourceMap}
                isLast={isLast(index)}
                context={context}
                atomsById={atomsById}
                onChange={(next, reworded) => changeParagraph(index, next, reworded)}
                onMoveUp={index > 0 ? () => move(index, index - 1) : undefined}
                onMoveDown={index < value.paragraphs.length - 1 ? () => move(index, index + 1) : undefined}
                onRemove={() => {
                  setRemoved({ index, text: paragraph });
                  setParagraphs(value.paragraphs.filter((_, i) => i !== index));
                }}
                onFocus={() => onFocusParagraph(index)}
                onBlur={() => onFocusParagraph(null)}
              />
            ))}
            <div className="flex flex-wrap items-center gap-2 px-1">
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => {
                  const at = value.paragraphs.length;
                  setParagraphs([...value.paragraphs, '']);
                  setTimeout(() =>
                    containerRef.current?.querySelector<HTMLTextAreaElement>(`[data-index="${at}"] textarea`)?.focus(),
                  );
                }}
              >
                <Plus size={13} />
                Add paragraph
              </Btn>
              {removed && (
                <span role="status" className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Paragraph removed.
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const paragraphs = value.paragraphs.slice();
                      paragraphs.splice(Math.min(removed.index, paragraphs.length), 0, removed.text);
                      setParagraphs(paragraphs);
                      setRemoved(null);
                    }}
                  >
                    <RotateCcw size={12} />
                    Undo
                  </Btn>
                </span>
              )}
            </div>
          </div>

          <div data-field="closing" className="rounded-lg px-2">
            <FieldInput
              label="Closing"
              flat
              className="[&>input]:-mx-2"
              value={value.closing}
              onChange={(closing) => onChange({ ...value, closing })}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
