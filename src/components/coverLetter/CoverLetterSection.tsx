// What this file is: the Cover Letter tab's self-contained panel on the
// Generate page -- owns its own generation/editing/history/export state,
// mirroring GeneratePage's resume flow (build/regenerate with a two-step
// confirm, version history via genStore.ts's snapshot mechanism, export via
// plain window.print()). The one real difference from the resume flow: this
// calls the LLM (generateCoverLetterContent.ts), so it also needs
// loading/error states resume generation never did (selectResumeContent.ts
// is synchronous and can't fail).
// In plain terms: the whole "build a cover letter for this job" screen --
// generate it, edit it with a live preview, roll back to an earlier version,
// export it.

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, FileText, History, Sparkles } from 'lucide-react';
import type {
  CoverLetterContent,
  Generation,
  GenerationSnapshot,
  GenerationStrategy,
  JobPosting,
  Profile,
  ProfileAtom,
} from '../../types';
import { buildProfileAtoms } from '../../lib/profileAtoms';
import { loadGeneration, listSnapshots, newGeneration, saveGeneration, snapshotGeneration } from '../../lib/genStore';
import { generateCoverLetterContent } from '../../lib/generation/generateCoverLetterContent';
import { llmErrorMessage } from '../../lib/llm';
import { useAutosaveIndicator } from '../../lib/useAutosaveIndicator';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { coverLetterToMarkdown } from '../../lib/export/toMarkdown';
import { coverLetterToDocx } from '../../lib/export/toDocx';
import { downloadBlob, downloadTextFile } from '../../lib/download';
import { Btn, Card, SavedIndicator, Skeleton } from '../ui/primitives';
import { CoverLetterEditor } from './CoverLetterEditor';
import { CoverLetterPrintView } from './CoverLetterPrintView';
import type { CoverLetterNavTarget } from './coverLetterNav';

export function CoverLetterSection({
  posting,
  profile,
  strategy = 'matched',
  actionsPortalTarget,
}: {
  posting: JobPosting;
  profile: Profile;
  /**
   * Which route's letter this tab is showing. On 'holistic' the evidence pool
   * comes from the posting's direct-selection pass instead of its confirmed
   * requirement matches, and the result is stored separately, so both routes'
   * letters coexist on one posting for comparison.
   */
  strategy?: GenerationStrategy;
  /** DOM node in the shared page header's actions slot -- action buttons
   * portal into it so they land in the same header position the resume
   * tab's actions use, instead of appearing in their own row lower down. */
  actionsPortalTarget: HTMLDivElement | null;
}) {
  const [generation, setGeneration] = useState<Generation | null | 'none'>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [snapshots, setSnapshots] = useState<GenerationSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingRestoreId, setConfirmingRestoreId] = useState<string | null>(null);
  const hasWritingSamples = profile.writingSamples.some((s) => s.trim() !== '');
  const [useWritingStyle, setUseWritingStyle] = useState(hasWritingSamples);
  // Which paragraph is focused in the editor right now, so the live preview
  // alongside it can highlight the matching spot.
  const [focusedParagraph, setFocusedParagraph] = useState<number | null>(null);
  // A one-shot "scroll to and flash this field" request fired by clicking
  // something in the live preview -- the nonce lets the same target be
  // re-requested by clicking it again (same reasoning as GeneratePage's
  // resume navRequest).
  const [navRequest, setNavRequest] = useState<{ target: CoverLetterNavTarget; nonce: number } | null>(null);
  const { saved: justRestored, pulse: pulseRestored } = useAutosaveIndicator();
  const { saved: exported, pulse: pulseExported } = useAutosaveIndicator();
  const [exportedLabel, setExportedLabel] = useState('Exported');
  const [showExportMenu, setShowExportMenu] = useState(false);
  useEscapeKey(showHistory, () => setShowHistory(false));
  useEscapeKey(showExportMenu, () => setShowExportMenu(false));

  const refresh = useCallback(() => {
    loadGeneration(posting.id, 'coverLetter', strategy).then((g) => setGeneration(g ?? 'none'));
    listSnapshots(posting.id, 'coverLetter', strategy).then(setSnapshots);
  }, [posting.id, strategy]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleGenerate() {
    const selection = posting.holisticSelection;
    if (strategy === 'holistic' ? !selection : !posting.analysis) return;
    if (generation !== 'none' && generation !== null) {
      await snapshotGeneration(generation);
    }
    setStatus('loading');
    setError(null);
    setConfirmingRegenerate(false);
    try {
      const atoms = buildProfileAtoms(profile);
      // On the direct route the selection pass already chose the evidence and
      // read the role, so it supplies both instead of the analysis. Ordered by
      // the model's own ranking, and filtered to atoms that still exist (an
      // edited bullet re-hashes to a new id, so a stale pick points at
      // nothing).
      const holistic =
        strategy === 'holistic' && selection
          ? {
              atoms: selection.atomIds
                .map((atomId) => atoms.find((a) => a.id === atomId))
                .filter((a): a is ProfileAtom => Boolean(a)),
              roleSummary: selection.roleSummary,
            }
          : undefined;
      const { content, sourceMap } = await generateCoverLetterContent(profile, posting, atoms, {
        useWritingStyle,
        holistic,
      });
      const next = newGeneration(posting.id, 'coverLetter', content, sourceMap, strategy);
      await saveGeneration(next);
      setGeneration(next);
      setStatus('idle');
      listSnapshots(posting.id, 'coverLetter', strategy).then(setSnapshots);
    } catch (err) {
      setError(llmErrorMessage(err, 'Generating your cover letter'));
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
    listSnapshots(posting.id, 'coverLetter', strategy).then(setSnapshots);
  }

  // Deterministic -- no LLM call, just a different renderer over the same
  // current letter content, same as the resume tab's Markdown/DOCX export.
  // In plain terms: downloads the cover letter as a Markdown file.
  function handleExportMarkdown() {
    if (generation === 'none' || generation === null) return;
    const name = profile.contact.name.trim() || 'cover_letter';
    const md = coverLetterToMarkdown(generation.content as CoverLetterContent, profile.contact);
    downloadTextFile(`${name.replace(/\s+/g, '_')}.md`, md, 'text/markdown');
    setExportedLabel('Exported');
    pulseExported();
    setShowExportMenu(false);
  }

  async function handleExportDocx() {
    if (generation === 'none' || generation === null) return;
    const name = profile.contact.name.trim() || 'cover_letter';
    const blob = await coverLetterToDocx(generation.content as CoverLetterContent, profile.contact);
    downloadBlob(`${name.replace(/\s+/g, '_')}.docx`, blob);
    setExportedLabel('Exported');
    pulseExported();
    setShowExportMenu(false);
  }

  function updateContent(content: CoverLetterContent) {
    setGeneration((prev) => {
      if (!prev || prev === 'none') return prev;
      const next = { ...prev, content };
      void saveGeneration(next);
      return next;
    });
  }

  if (generation === null) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hasLetter = generation !== 'none';

  return (
    <>
      {hasLetter &&
        actionsPortalTarget &&
        createPortal(
          !confirmingRegenerate ? (
            <>
              <SavedIndicator visible={justRestored} label="Restored" />
              {snapshots.length > 0 && (
                <div className="relative">
                  <Btn size="sm" variant="secondary" onClick={() => setShowHistory((v) => !v)}>
                    <History size={13} />
                    History ({snapshots.length})
                  </Btn>
                  {showHistory && (
                    <>
                      {/* Closes the popover on outside click without a
                          global listener -- a full-screen transparent layer
                          under the popover, same trick Modal's backdrop and
                          the resume tab's identical History popover use. */}
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
                                  Replace the current letter with the{' '}
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
              <Btn
                size="sm"
                variant="secondary"
                onClick={() => setConfirmingRegenerate(true)}
                disabled={status === 'loading'}
              >
                <Sparkles size={13} />
                {status === 'loading' ? 'Writing…' : 'Regenerate'}
              </Btn>
              <div className="relative flex items-center gap-1.5">
                <SavedIndicator visible={exported} label={exportedLabel} />
                <Btn size="sm" onClick={() => setShowExportMenu((v) => !v)}>
                  <Download size={13} />
                  Export
                </Btn>
                {showExportMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 w-52 z-50 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          window.print();
                        }}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Download size={13} />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={handleExportMarkdown}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <FileText size={13} />
                        Markdown (.md)
                      </button>
                      <button
                        type="button"
                        onClick={handleExportDocx}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <FileText size={13} />
                        Word (.docx)
                      </button>
                    </div>
                  </>
                )}
              </div>
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

      {hasLetter && status === 'error' && error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 mb-5 print:hidden">
          <AlertTriangle size={13} className="shrink-0" />
          {error}
        </p>
      )}

      {!hasLetter ? (
        <Card className="p-10 flex flex-col items-center text-center gap-5 print:hidden">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-lg">
            <Sparkles size={22} className="text-white dark:text-slate-900" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Write a tailored cover letter</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed max-w-sm">
              Grounded in your matched requirements and real profile evidence -- any sentence the AI
              can't back up with something from your profile is flagged for you to review.
            </p>
          </div>
          {hasWritingSamples && (
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={useWritingStyle}
                onChange={(e) => setUseWritingStyle(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              Mimic my writing style from a saved sample
            </label>
          )}
          {status === 'error' && error && (
            <p className="text-xs text-red-600 dark:text-red-400 max-w-sm flex items-center gap-1.5">
              <AlertTriangle size={13} className="shrink-0" />
              {error}
            </p>
          )}
          <Btn onClick={handleGenerate} disabled={status === 'loading'} className="min-w-[140px] justify-center">
            <Sparkles size={14} />
            {status === 'loading' ? 'Writing…' : 'Write cover letter'}
          </Btn>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start print:hidden">
            <CoverLetterEditor
              value={generation.content as CoverLetterContent}
              sourceMap={generation.sourceMap}
              profile={profile}
              onChange={updateContent}
              onFocusParagraph={setFocusedParagraph}
              navRequest={navRequest}
            />
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scroll-thin">
              <CoverLetterPrintView
                content={generation.content as CoverLetterContent}
                contact={profile.contact}
                variant="preview"
                focusedParagraph={focusedParagraph}
                onNavigate={(target) => setNavRequest({ target, nonce: Date.now() })}
              />
            </div>
          </div>
          <CoverLetterPrintView content={generation.content as CoverLetterContent} contact={profile.contact} />
        </>
      )}
    </>
  );
}
