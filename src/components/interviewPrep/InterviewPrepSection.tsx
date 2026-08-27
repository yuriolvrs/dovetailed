// What this file is: the Interview Prep tab's self-contained panel on the
// Generate page -- owns its own generation/editing/history state, mirroring
// CoverLetterSection's flow (build/regenerate with a two-step confirm,
// version history via genStore.ts's snapshot mechanism) minus export (this
// is working material for the user, not a document they send out). Each
// question's rationale carries the same "Grounded in your profile" /
// "Not traceable" badge CoverLetterEditor.tsx uses per paragraph, since a
// question's rationale is generated prose that can reference a specific
// accomplishment the way a cover-letter sentence can.
// In plain terms: the screen where you generate likely interview questions
// for this job, each with a note on why it's likely and (where relevant) a
// link back to the real accomplishment it's based on, editable and
// regeneratable like the resume/cover letter tabs.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, Copy, History, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Generation, GenerationSnapshot, InterviewPrepContent, JobPosting, Profile, ProfileAtom } from '../../types';
import { buildProfileAtoms } from '../../lib/profileAtoms';
import { loadGeneration, listSnapshots, newGeneration, saveGeneration, snapshotGeneration } from '../../lib/genStore';
import { generateInterviewPrepContent } from '../../lib/generation/generateInterviewPrepContent';
import { llmErrorMessage } from '../../lib/llm';
import { useAutosaveIndicator } from '../../lib/useAutosaveIndicator';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { AtomHoverDetail, Badge, Btn, Card, Collapsible, SavedIndicator, Skeleton } from '../ui/primitives';

// Click-to-edit text: renders as plain prose until clicked, then becomes a
// self-sizing textarea that commits on blur (Escape cancels). Used for both a
// question and its rationale so the prep list reads as something you study
// rather than a stack of permanently-open form inputs -- and so editing a
// question writes to Dexie once on blur instead of once per keystroke.
// In plain terms: text you can click to edit in place, saved when you click
// away.
function EditableText({
  value,
  onCommit,
  className,
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  className: string;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit its content so a long question is never trapped
  // behind a scrollbar in a two-row box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onCommit(next);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit"
        className={`block w-full text-left rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${className} ${value ? '' : 'italic text-slate-300 dark:text-slate-600'}`}
      >
        {value || placeholder}
      </button>
    );
  }

  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setEditing(false);
      }}
      className={`block w-full -mx-1.5 px-1.5 py-1 rounded-lg resize-none overflow-hidden bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-500 outline-none ring-2 ring-blue-400/25 dark:ring-blue-400/20 ${className}`}
    />
  );
}

export function InterviewPrepSection({
  posting,
  profile,
  actionsPortalTarget,
}: {
  posting: JobPosting;
  profile: Profile;
  /** DOM node in the shared page header's actions slot -- see CoverLetterSection for why. */
  actionsPortalTarget: HTMLDivElement | null;
}) {
  const [generation, setGeneration] = useState<Generation | null | 'none'>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [snapshots, setSnapshots] = useState<GenerationSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingRestoreId, setConfirmingRestoreId] = useState<string | null>(null);
  // Which questions have their "why this is likely" rationale expanded --
  // collapsed by default so the whole question list stays scannable.
  const [openRationales, setOpenRationales] = useState<Set<number>>(new Set());
  const { saved: justRestored, pulse: pulseRestored } = useAutosaveIndicator();
  const { saved: justCopied, pulse: pulseCopied } = useAutosaveIndicator();
  const { saved, pulse } = useAutosaveIndicator();
  useEscapeKey(showHistory, () => setShowHistory(false));

  const atomsById = useMemo(() => new Map(buildProfileAtoms(profile).map((a) => [a.id, a])), [profile]);

  const refresh = useCallback(() => {
    loadGeneration(posting.id, 'interviewPrep').then((g) => setGeneration(g ?? 'none'));
    listSnapshots(posting.id, 'interviewPrep').then(setSnapshots);
  }, [posting.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleGenerate() {
    if (!posting.analysis) return;
    if (generation !== 'none' && generation !== null) {
      await snapshotGeneration(generation);
    }
    setStatus('loading');
    setError(null);
    setConfirmingRegenerate(false);
    try {
      const atoms = buildProfileAtoms(profile);
      const { content, sourceMap } = await generateInterviewPrepContent(posting, atoms);
      const next = newGeneration(posting.id, 'interviewPrep', content, sourceMap);
      await saveGeneration(next);
      setGeneration(next);
      setStatus('idle');
      listSnapshots(posting.id, 'interviewPrep').then(setSnapshots);
    } catch (err) {
      setError(llmErrorMessage(err, 'Generating interview prep'));
      setStatus('error');
    }
  }

  async function handleRestore(snapshot: GenerationSnapshot) {
    if (generation === 'none' || generation === null) return;
    await snapshotGeneration(generation);
    const restored: Generation = { ...generation, content: snapshot.content, sourceMap: snapshot.sourceMap };
    await saveGeneration(restored);
    setGeneration(restored);
    setConfirmingRestoreId(null);
    setShowHistory(false);
    pulseRestored();
    listSnapshots(posting.id, 'interviewPrep').then(setSnapshots);
  }

  function updateContent(content: InterviewPrepContent) {
    setGeneration((prev) => {
      if (!prev || prev === 'none') return prev;
      const next = { ...prev, content };
      void saveGeneration(next);
      return next;
    });
    pulse();
  }

  if (generation === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasPrep = generation !== 'none';
  const content = hasPrep ? (generation.content as InterviewPrepContent) : null;
  const sourceMap = hasPrep ? generation.sourceMap : [];

  // The profile atoms a question was grounded in, if any -- drives both the
  // per-question badge and the "N of M grounded" count in the list header.
  function groundedAtoms(question: string): ProfileAtom[] {
    const entry = sourceMap.find((e) => e.generatedText === question);
    if (!entry) return [];
    return entry.atomIds.map((id) => atomsById.get(id)).filter((a): a is ProfileAtom => a !== undefined);
  }

  const questions = content?.questions ?? [];
  const groundedCount = questions.filter((q) => groundedAtoms(q.question).length > 0).length;
  const allOpen = questions.length > 0 && openRationales.size === questions.length;

  function toggleRationale(index: number) {
    setOpenRationales((prev) => {
      const next = new Set(prev);
      if (!next.delete(index)) next.add(index);
      return next;
    });
  }

  function updateQuestion(index: number, patch: Partial<(typeof questions)[number]>) {
    if (!content) return;
    updateContent({
      questions: content.questions.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  // Plain-text dump of the whole prep sheet, for pasting into notes or a doc
  // to review away from the app.
  async function handleCopyAll() {
    const text = questions
      .map((q, i) => `${i + 1}. ${q.question}\n   Why: ${q.rationale}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      pulseCopied();
    } catch {
      // Clipboard permission denied -- nothing useful to recover, and the
      // absent "Copied" confirmation is itself the signal it didn't work.
    }
  }

  return (
    <>
      {hasPrep &&
        actionsPortalTarget &&
        createPortal(
          !confirmingRegenerate ? (
            <>
              <SavedIndicator visible={saved} />
              <SavedIndicator visible={justRestored} label="Restored" />
              {snapshots.length > 0 && (
                <div className="relative">
                  <Btn size="sm" variant="secondary" onClick={() => setShowHistory((v) => !v)}>
                    <History size={13} />
                    History ({snapshots.length})
                  </Btn>
                  {showHistory && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />
                      <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-4">
                        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                          Version history
                        </p>
                        <div className="space-y-1.5">
                          {snapshots.map((snapshot) =>
                            confirmingRestoreId === snapshot.id ? (
                              <div
                                key={snapshot.id}
                                className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5"
                              >
                                <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">
                                  Replace the current questions with the{' '}
                                  {new Date(snapshot.createdAt).toLocaleString()} version?
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <Btn size="sm" onClick={() => handleRestore(snapshot)}>
                                    Yes, restore
                                  </Btn>
                                  <Btn size="sm" variant="secondary" onClick={() => setConfirmingRestoreId(null)}>
                                    Cancel
                                  </Btn>
                                </div>
                              </div>
                            ) : (
                              <div
                                key={snapshot.id}
                                className="rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 px-3 py-2.5"
                              >
                                <span className="text-xs text-slate-700 dark:text-slate-300">
                                  {new Date(snapshot.createdAt).toLocaleString()}
                                </span>
                                <Btn size="sm" variant="secondary" onClick={() => setConfirmingRestoreId(snapshot.id)}>
                                  Restore
                                </Btn>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingRegenerate(true)} disabled={status === 'loading'}>
                <Sparkles size={13} />
                {status === 'loading' ? 'Writing…' : 'Regenerate'}
              </Btn>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">This will overwrite your edits. Regenerate?</span>
              <Btn size="sm" onClick={handleGenerate} disabled={status === 'loading'}>
                {status === 'loading' ? 'Writing…' : 'Yes, regenerate'}
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingRegenerate(false)}>
                Cancel
              </Btn>
            </div>
          ),
          actionsPortalTarget,
        )}

      {hasPrep && status === 'error' && error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 mb-5">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </p>
      )}

      {!hasPrep ? (
        <Card className="p-10 flex flex-col items-center text-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-lg">
            <Sparkles size={22} className="text-white dark:text-slate-900" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Prepare for the interview</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed max-w-sm">
              Generates likely interview questions for this role, each grounded in your matched
              requirements and real profile evidence where relevant -- review and edit before your
              interview.
            </p>
          </div>
          {status === 'error' && error && (
            <p className="text-xs text-red-600 dark:text-red-400 max-w-sm flex items-center gap-1.5">
              <AlertTriangle size={13} className="shrink-0" />
              {error}
            </p>
          )}
          <Btn
            onClick={handleGenerate}
            disabled={status === 'loading' || !posting.analysis}
            className="min-w-[140px] justify-center"
          >
            <Sparkles size={14} />
            {status === 'loading' ? 'Writing…' : 'Generate questions'}
          </Btn>
          {!posting.analysis && (
            // Interview prep is built from the extracted requirement list, so
            // it needs the analysis pass -- the direct route doesn't produce
            // one. Said plainly here rather than leaving a button that looks
            // enabled and does nothing.
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm">
              Interview prep is built from this posting's requirement list, which only the analysis
              route produces.{' '}
              <Link to={`/jobs/${posting.id}`} className="underline hover:text-slate-900 dark:hover:text-slate-100">
                Run analysis
              </Link>{' '}
              to enable it.
            </p>
          )}
        </Card>
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {questions.length} question{questions.length !== 1 ? 's' : ''}
              </span>
              {groundedCount > 0 && ` · ${groundedCount} grounded in your profile`}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <Btn
                size="sm"
                variant="ghost"
                onClick={() =>
                  setOpenRationales(allOpen ? new Set() : new Set(questions.map((_, i) => i)))
                }
              >
                <ChevronDown size={13} className={`transition-transform ${allOpen ? 'rotate-180' : ''}`} />
                {allOpen ? 'Collapse all' : 'Expand all'}
              </Btn>
              <Btn size="sm" variant="ghost" onClick={handleCopyAll}>
                {justCopied ? <Check size={13} /> : <Copy size={13} />}
                {justCopied ? 'Copied' : 'Copy all'}
              </Btn>
            </div>
          </div>

          {questions.map((q, i) => {
            const atoms = groundedAtoms(q.question);
            const open = openRationales.has(i);
            return (
              <div key={i} className="flex items-start gap-3 px-5 py-4">
                <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[11px] font-semibold">
                  {i + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <EditableText
                    value={q.question}
                    onCommit={(question) => updateQuestion(i, { question })}
                    placeholder="Empty question"
                    className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-relaxed"
                  />

                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    <button
                      type="button"
                      onClick={() => toggleRationale(i)}
                      aria-expanded={open}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    >
                      <ChevronDown
                        size={12}
                        className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                      />
                      Why this is likely
                    </button>
                    {atoms.length > 0 && (
                      <AtomHoverDetail atoms={atoms}>
                        <Badge color="blue">
                          <Sparkles size={11} />
                          Grounded
                        </Badge>
                      </AtomHoverDetail>
                    )}
                  </div>

                  <Collapsible open={open}>
                    <div className="pt-2">
                      <EditableText
                        value={q.rationale}
                        onCommit={(rationale) => updateQuestion(i, { rationale })}
                        placeholder="Add a note on why this is likely"
                        className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed"
                      />
                    </div>
                  </Collapsible>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
