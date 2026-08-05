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
// In plain terms: the screen where you review and tweak a generated cover
// letter, with a warning on any sentence the AI wrote that isn't actually
// backed by something in your real profile.

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { CoverLetterContent, SourceMapEntry } from '../../types';
import { StringList } from '../StringList';
import { Badge, Card, FieldInput } from '../ui/primitives';

function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '');
}

export function CoverLetterEditor({
  value,
  sourceMap,
  onChange,
  onFocusParagraph,
}: {
  value: CoverLetterContent;
  sourceMap: SourceMapEntry[];
  onChange: (content: CoverLetterContent) => void;
  /** Reports a paragraph gaining focus (index) or losing it (null), so the live preview can highlight it. */
  onFocusParagraph: (index: number | null) => void;
}) {
  const atomIdsByNormalizedText = useMemo(
    () => new Map(sourceMap.map((e) => [normalizeForMatch(e.generatedText), e.atomIds])),
    [sourceMap],
  );

  function paragraphBadge(paragraph: string) {
    if (paragraph.trim() === '') return null;
    const atomIds = atomIdsByNormalizedText.get(normalizeForMatch(paragraph));
    // No sourceMap entry at all (a paragraph the user added by hand) is
    // treated the same as an empty one -- both are unevidenced AI-free text
    // the user is fully responsible for, nothing to flag as a broken AI claim.
    if (atomIds === undefined) return null;
    if (atomIds.length > 0) return null;
    return (
      <Badge color="amber">
        <AlertTriangle size={11} />
        Not traceable to your profile -- review before sending
      </Badge>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <FieldInput
          label="Greeting"
          value={value.greeting}
          onChange={(greeting) => onChange({ ...value, greeting })}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            Paragraphs
          </span>
          <StringList
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

        <FieldInput
          label="Closing"
          value={value.closing}
          onChange={(closing) => onChange({ ...value, closing })}
        />
      </Card>
    </div>
  );
}
