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
import { AlertTriangle, Download, History, Sparkles } from 'lucide-react';
import type { CoverLetterContent, Generation, GenerationSnapshot, JobPosting, Profile } from '../../types';
import { buildProfileAtoms } from '../../lib/profileAtoms';
import { loadGeneration, listSnapshots, newGeneration, saveGeneration, snapshotGeneration } from '../../lib/genStore';
import { generateCoverLetterContent } from '../../lib/generation/generateCoverLetterContent';
import { llmErrorMessage } from '../../lib/llm';
import { Btn, Card, Skeleton } from '../ui/primitives';
import { CoverLetterEditor } from './CoverLetterEditor';
import { CoverLetterPrintView } from './CoverLetterPrintView';

export function CoverLetterSection({ posting, profile }: { posting: JobPosting; profile: Profile }) {
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

  const refresh = useCallback(() => {
    loadGeneration(posting.id, 'coverLetter').then((g) => setGeneration(g ?? 'none'));
    listSnapshots(posting.id, 'coverLetter').then(setSnapshots);
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
      const { content, sourceMap } = await generateCoverLetterContent(profile, posting, atoms, {
        useWritingStyle,
      });
      const next = newGeneration(posting.id, 'coverLetter', content, sourceMap);
      await saveGeneration(next);
      setGeneration(next);
      setStatus('idle');
      listSnapshots(posting.id, 'coverLetter').then(setSnapshots);
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
    listSnapshots(posting.id, 'coverLetter').then(setSnapshots);
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
      {hasLetter && (
        <div className="flex flex-col items-end gap-2 mb-5 print:hidden">
          <div className="flex items-center justify-end gap-2">
            {!confirmingRegenerate ? (
              <>
                {snapshots.length > 0 && (
                  <Btn size="sm" variant="secondary" onClick={() => setShowHistory((v) => !v)}>
                    <History size={13} />
                    History ({snapshots.length})
                  </Btn>
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
                <Btn size="sm" onClick={() => window.print()}>
                  <Download size={13} />
                  Export PDF
                </Btn>
              </>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">This will overwrite your edits. Regenerate?</span>
                <Btn size="sm" onClick={handleGenerate} disabled={status === 'loading'}>
                  {status === 'loading' ? 'Writing…' : 'Yes, regenerate'}
                </Btn>
                <Btn size="sm" variant="secondary" onClick={() => setConfirmingRegenerate(false)}>
                  Cancel
                </Btn>
              </div>
            )}
          </div>
          {status === 'error' && error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertTriangle size={13} className="shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}

      {showHistory && snapshots.length > 0 && (
        <Card className="p-4 mb-5 print:hidden">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">
            Version history
          </p>
          <div className="space-y-1.5">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="rounded-xl border border-slate-200 flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <span className="text-sm text-slate-700">{new Date(snapshot.createdAt).toLocaleString()}</span>
                {confirmingRestoreId === snapshot.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600">Replace the current letter with this version?</span>
                    <Btn size="sm" onClick={() => handleRestore(snapshot)}>
                      Yes, restore
                    </Btn>
                    <Btn size="sm" variant="secondary" onClick={() => setConfirmingRestoreId(null)}>
                      Cancel
                    </Btn>
                  </div>
                ) : (
                  <Btn size="sm" variant="secondary" onClick={() => setConfirmingRestoreId(snapshot.id)}>
                    Restore
                  </Btn>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!hasLetter ? (
        <Card className="p-10 flex flex-col items-center text-center gap-5 print:hidden">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg">
            <Sparkles size={22} className="text-white" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-slate-900">Write a tailored cover letter</h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              Grounded in your matched requirements and real profile evidence -- any sentence the AI
              can't back up with something from your profile is flagged for you to review.
            </p>
          </div>
          {hasWritingSamples && (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={useWritingStyle}
                onChange={(e) => setUseWritingStyle(e.target.checked)}
                className="rounded border-slate-300"
              />
              Mimic my writing style from a saved sample
            </label>
          )}
          {status === 'error' && error && (
            <p className="text-xs text-red-600 max-w-sm flex items-center gap-1.5">
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
              onChange={updateContent}
              onFocusParagraph={setFocusedParagraph}
            />
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scroll-thin">
              <CoverLetterPrintView
                content={generation.content as CoverLetterContent}
                contact={profile.contact}
                variant="preview"
                focusedParagraph={focusedParagraph}
              />
            </div>
          </div>
          <CoverLetterPrintView content={generation.content as CoverLetterContent} contact={profile.contact} />
        </>
      )}
    </>
  );
}
