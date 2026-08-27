// What this file is: the pasted job-posting body, as an editable panel. Shared
// by the posting hub (/jobs/:id) and the Matching route's requirements screen,
// which both need the same text with the same save behaviour -- large free text
// persists on blur rather than on every keystroke, the way the Profile page's
// long fields do. Two shapes: "full" is the tall editable panel, "summary" is
// the one-line preview the hub collapses to once a route has produced
// something, since by then the posting has been read and the page is about the
// work rather than the reading.
// In plain terms: the box holding the job ad's text, either open for reading
// and editing or folded down to a single line you can expand again.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { JobPosting } from '../../types';
import { MAX_POSTING_CHARS } from '../../prompts/analyzePosting';
import { Btn, Card, SavedIndicator, UnsavedIndicator } from '../ui/primitives';
import { useAutosaveIndicator } from '../../lib/useAutosaveIndicator';

const EYEBROW = 'text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest';

export function PostingTextPanel({
  posting,
  onLiveChange,
  onCommit,
  variant = 'full',
  className = '',
}: {
  posting: JobPosting;
  /** Every keystroke -- updates what's on screen without writing to storage. */
  onLiveChange: (rawText: string) => void;
  /** Blur -- persists what's on screen. */
  onCommit: () => void;
  /** "full" is the tall editable panel; "summary" folds to one line with an Expand control. */
  variant?: 'full' | 'summary';
  className?: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { saved, pulse } = useAutosaveIndicator();

  function commit() {
    onCommit();
    setDirty(false);
    pulse();
  }

  const editor = (
    <>
      <textarea
        className="w-full flex-1 min-h-[16rem] text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-transparent resize-none border border-transparent rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 dark:focus:border-blue-400 px-2 py-2 transition-colors overflow-y-auto"
        value={posting.rawText}
        onChange={(e) => {
          onLiveChange(e.target.value);
          setDirty(true);
        }}
        onBlur={commit}
        aria-label="Posting text"
      />
      {posting.rawText.length > MAX_POSTING_CHARS && (
        <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 shrink-0">
          Only the first {MAX_POSTING_CHARS.toLocaleString()} characters are sent to the AI.
        </p>
      )}
    </>
  );

  if (variant === 'summary') {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className={EYEBROW}>Posting text</p>
              {dirty ? <UnsavedIndicator /> : <SavedIndicator visible={saved} />}
            </div>
            {!expanded && (
              <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                {posting.rawText.trim() || 'Nothing pasted yet.'}
              </p>
            )}
          </div>
          <Btn size="sm" variant="secondary" onClick={() => setExpanded((v) => !v)}>
            <ChevronDown size={13} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? 'Collapse' : 'Expand'}
          </Btn>
        </div>
        {expanded && <div className="flex flex-col mt-3">{editor}</div>}
      </Card>
    );
  }

  return (
    <Card className={`p-5 flex flex-col ${className}`}>
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <p className={EYEBROW}>Posting text</p>
        {dirty ? <UnsavedIndicator /> : <SavedIndicator visible={saved} />}
      </div>
      {editor}
    </Card>
  );
}
