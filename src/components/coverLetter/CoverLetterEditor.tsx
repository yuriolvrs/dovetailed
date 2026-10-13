// What this file is: the field-editable form for a generated cover letter --
// greeting, paragraphs (add/remove/reorder-free-text via StringList, same
// primitive the Profile page uses for skills/writing samples), and closing.
// Unlike ResumeEditor's bullets (selected verbatim, nothing to warn about --
// see selectResumeContent.ts), a cover letter's paragraphs are genuinely
// AI-written prose, so each paragraph carries an amber "not traceable to
// your profile" badge whenever its sourceMap entry has no backing atomIds --
// the CLAUDE.md-mandated "UI flags unevidenced claims" rule, applied the way
// the pre-correction resume editor once did. Editing a paragraph's wording
// intentionally drops its badge match (same "editing it is the user taking
// ownership" reasoning ResumeEditor uses), since a hand-edited sentence is no
// longer the exact claim the model's sourceMap vouched for.
// navRequest (a click in the live preview -- see CoverLetterPrintView's
// onNavigate) scrolls to and briefly flashes the greeting/closing field or
// the matching paragraph row; paragraph rows are found via the data-index
// attribute EditableList puts on every row (StringList -> EditableList), so
// no extra plumbing was needed there.
// In plain terms: the screen where you review and tweak a generated cover
// letter, with a warning on any sentence the AI wrote that isn't actually
// backed by something in your real profile, and which jumps to a field when
// you click the matching part of the live preview.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import type { CoverLetterContent, Profile, ProfileAtom, SourceMapEntry } from '../../types';
import type { CoverLetterNavTarget } from './coverLetterNav';
import { buildProfileAtoms } from '../../lib/profileAtoms';
import { citeParagraph } from '../../lib/coverLetterCitations';
import { StringList } from '../StringList';
import { AtomHoverDetail, Badge, Card, FieldInput } from '../ui/primitives';

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
  /** Source of the profile atoms a paragraph's sourceMap entry points to, for the hover tooltip. */
  profile: Profile;
  onChange: (content: CoverLetterContent) => void;
  /** Reports a paragraph gaining focus (index) or losing it (null), so the live preview can highlight it. */
  onFocusParagraph: (index: number | null) => void;
  /** A field clicked in the live preview, to scroll to and flash here -- see CoverLetterPrintView's onNavigate. */
  navRequest?: { target: CoverLetterNavTarget; nonce: number } | null;
  /** Posting text, role, company and candidate name: a closing that names nothing beyond these is not flagged. */
  closingContext?: string;
}) {
  const atomsById = useMemo(() => new Map(buildProfileAtoms(profile).map((a) => [a.id, a])), [profile]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightField, setHighlightField] = useState<'greeting' | 'closing' | null>(null);

  useEffect(() => {
    if (!navRequest) return;
    const { target } = navRequest;
    let removeRowHighlight: (() => void) | undefined;
    let fieldHighlightTimer: ReturnType<typeof setTimeout> | undefined;

    const scrollTimer = setTimeout(() => {
      if (target.section === 'paragraph') {
        const row = containerRef.current?.querySelector(`[data-index="${target.index}"]`);
        row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        row?.classList.add('bg-amber-50', 'dark:bg-amber-500/10');
        const rowClearTimer = setTimeout(() => row?.classList.remove('bg-amber-50', 'dark:bg-amber-500/10'), 1500);
        removeRowHighlight = () => {
          clearTimeout(rowClearTimer);
          row?.classList.remove('bg-amber-50', 'dark:bg-amber-500/10');
        };
      } else {
        containerRef.current?.querySelector(`[data-field="${target.section}"]`)?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        });
      }
    }, 50);

    if (target.section !== 'paragraph') {
      setHighlightField(target.section);
      fieldHighlightTimer = setTimeout(() => setHighlightField(null), 1500);
    }

    // Also unconditionally clears any pending highlight on cleanup --
    // otherwise when navRequest flips to null/a different field, this
    // effect reruns, its cleanup cancels the pending "un-highlight" timers,
    // and the highlight is left stuck on forever.
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(fieldHighlightTimer);
      removeRowHighlight?.();
      setHighlightField(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  // Sentence-level citations (see coverLetterCitations.ts): a badge counts
  // the profile lines a paragraph cites, or how many sentences need a check.
  function paragraphBadge(paragraph: string) {
    if (paragraph.trim() === '') return null;
    const spans = citeParagraph(paragraph, sourceMap, {
      isLast: paragraph === value.paragraphs[value.paragraphs.length - 1],
      context: closingContext ?? '',
    });
    const flagged = spans.filter((s) => s.status === 'flagged').length;
    if (flagged > 0) {
      return (
        <Badge color="amber">
          <AlertTriangle size={11} />
          {flagged} {flagged === 1 ? 'sentence is' : 'sentences are'} not traceable to your profile. Review before sending.
        </Badge>
      );
    }
    const ids = [...new Set(spans.flatMap((s) => (s.status === 'cited' && s.entry ? s.entry.atomIds : [])))];
    const atoms = ids.map((id) => atomsById.get(id)).filter((a): a is ProfileAtom => a !== undefined);
    if (atoms.length === 0) return null;
    return (
      <AtomHoverDetail atoms={atoms}>
        <Badge color="blue">
          <Sparkles size={11} />
          Cites {atoms.length} profile {atoms.length === 1 ? 'line' : 'lines'}
        </Badge>
      </AtomHoverDetail>
    );
  }

  return (
    <div className="space-y-4" ref={containerRef}>
      <Card className="p-6 space-y-4">
        <div
          data-field="greeting"
          className={`rounded-lg transition-colors ${highlightField === 'greeting' ? 'ring-2 ring-amber-300' : ''}`}
        >
          <FieldInput
            label="Greeting"
            flat
            className="[&>input]:-mx-2"
            value={value.greeting}
            onChange={(greeting) => onChange({ ...value, greeting })}
          />
        </div>

        <div role="group" aria-labelledby="cl-paragraphs" className="flex flex-col gap-1.5">
          <span id="cl-paragraphs" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Paragraphs
          </span>
          {/* A citation backs part of a paragraph, not every sentence in it,
              so the badge counts sources instead of vouching for the whole. */}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Point at or Tab to a badge to see the profile lines a paragraph cites. Check that each claim
            is in them.
          </p>
          {/* Pulls the boxless rows out by their padding so the text lines up
              with the labels. */}
          <div className="-mx-3.5">
          <StringList
            itemLabel="Paragraph"
            variant="prose"
            items={value.paragraphs}
            onChange={(paragraphs) => onChange({ ...value, paragraphs })}
            multiline
            addLabel="Add paragraph"
            emptyLabel="No paragraphs yet."
            itemBadge={paragraphBadge}
            onItemFocus={onFocusParagraph}
            onItemBlur={() => onFocusParagraph(null)}
          />
          </div>
        </div>

        <div
          data-field="closing"
          className={`rounded-lg transition-colors ${highlightField === 'closing' ? 'ring-2 ring-amber-300' : ''}`}
        >
          <FieldInput
            label="Closing"
            flat
            className="[&>input]:-mx-2"
            value={value.closing}
            onChange={(closing) => onChange({ ...value, closing })}
          />
        </div>
      </Card>
    </div>
  );
}
