// What this file is: the Generate route's page (/jobs/:id/generate) --
// covers both documents built from a posting's confirmed matches, switched
// via an in-page Resume/Cover Letter tab rather than separate stages (they
// share the same matched requirements as their source). Resume: builds a
// tailored resume via selectResumeContent.ts -- a pure, synchronous
// selection/reordering of the profile's own content, no LLM call -- then
// hands the result to ResumeEditor for field-level editing (with a live
// preview alongside, via ResumePrintView), autosaving to Dexie via
// genStore.ts. Regenerating is an explicit, confirmed action (overwrites the
// single stored generation for this posting, same "Re-run" pattern as
// matching) since it discards manual edits -- but the version it's about to
// overwrite is snapshotted into history first (genStore.ts), so a "History"
// panel lets the user restore an earlier version instead of losing it for
// good. Export is a plain window.print() against the hidden ResumePrintView
// layout -- no PDF library needed. Cover Letter: its whole flow (generate/
// edit/history/export) lives in CoverLetterSection, a self-contained
// component this page just mounts for that tab -- see its own header for why
// it, unlike the resume, does call the LLM.
// In plain terms: the screen where you build a tailored resume and cover
// letter for a job, edit either with a live preview alongside, roll back to
// an earlier version if needed, and export to PDF.

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Download, FileText, History, Mail, Sparkles } from 'lucide-react';
import type { ExperienceEntry, Generation, GenerationSnapshot, JobPosting, Profile, ResumeContent } from '../types';
import type { ResumeFocusTarget, ResumeNavTarget } from '../lib/resumeEntryKeys';
import { loadJobPosting } from '../lib/jobStore';
import { loadProfile } from '../lib/profileStore';
import { buildProfileAtoms } from '../lib/profileAtoms';
import { loadGeneration, listSnapshots, newGeneration, saveGeneration, snapshotGeneration } from '../lib/genStore';
import { isResumeContentVerbatim, selectResumeContent } from '../lib/generation/selectResumeContent';
import { fitToOnePage } from '../lib/generation/fitToOnePage';
import { JobDetailHeader } from '../components/jobs/JobDetailHeader';
import { ResumeEditor } from '../components/resume/ResumeEditor';
import { ResumePrintView } from '../components/resume/ResumePrintView';
import { CoverLetterSection } from '../components/coverLetter/CoverLetterSection';
import { Btn, Card, PageSkeleton } from '../components/ui/primitives';

type Tab = 'resume' | 'coverLetter';

export default function GeneratePage() {
  const { id } = useParams<{ id: string }>();

  const [tab, setTab] = useState<Tab>('resume');
  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [generation, setGeneration] = useState<Generation | null | 'none'>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [snapshots, setSnapshots] = useState<GenerationSnapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingRestoreId, setConfirmingRestoreId] = useState<string | null>(null);
  // Checked once, when a generation is first loaded from storage -- not
  // recomputed on every render. It exists to catch an old generation saved
  // by the earlier LLM-rewriting design (see selectResumeContent.ts's file
  // header) that fabricated bullet text. Recomputing it live from the
  // current in-progress edit would be wrong: the moment a user hand-edits a
  // bullet's wording (or applies a "Suggest rewording" -- see
  // BulletRewriteSuggest.tsx) it stops matching the profile verbatim too,
  // which isn't fabrication, it's the user (or an approved suggestion)
  // intentionally changing the wording -- that shouldn't lock them out of
  // their own editor.
  const [stale, setStale] = useState(false);
  // Whole experience entries the last generate/regenerate dropped to fit one
  // page (see fitToOnePage.ts) -- shown as a dismissible "restore" prompt.
  // Not persisted: it's a note about what generation just did, not part of
  // the saved resume, and manually re-adding one clears the note.
  const [pageFitRemoved, setPageFitRemoved] = useState<ExperienceEntry[]>([]);
  // Which bullet is focused in the editor right now, so the live preview
  // alongside it can highlight the matching spot.
  const [focusedTarget, setFocusedTarget] = useState<ResumeFocusTarget | null>(null);
  // A one-shot "scroll to and open this field" request fired by clicking
  // something in the live preview -- the nonce lets the same target be
  // re-requested by clicking it again (a plain target object wouldn't
  // change, so an effect keyed on it wouldn't re-fire).
  const [navRequest, setNavRequest] = useState<{ target: ResumeNavTarget; nonce: number } | null>(null);
  // DOM node inside the shared header's actions slot that CoverLetterSection
  // portals its own action buttons into, so they land in the exact same
  // header position as the resume tab's actions instead of appearing lower
  // down the page when switching tabs.
  const [coverLetterActionsEl, setCoverLetterActionsEl] = useState<HTMLDivElement | null>(null);

  const refresh = useCallback(() => {
    if (!id) return;
    setPageFitRemoved([]);
    loadJobPosting(id).then((p) => setPosting(p ?? 'missing'));
    listSnapshots(id, 'resume').then(setSnapshots);
    Promise.all([loadProfile(), loadGeneration(id, 'resume')]).then(([p, g]) => {
      setProfile(p);
      const gen = g ?? 'none';
      setGeneration(gen);
      setStale(gen !== 'none' ? !isResumeContentVerbatim(gen.content as ResumeContent, p) : false);
    });
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sets the print header's document title to the candidate's name while
  // this page is open (browsers default the print header to document.title),
  // restoring the app's title on unmount.
  useEffect(() => {
    if (!profile?.contact.name) return;
    const previous = document.title;
    document.title = profile.contact.name;
    return () => {
      document.title = previous;
    };
  }, [profile?.contact.name]);

  async function handleGenerate() {
    if (!id || !posting || posting === 'missing' || !posting.analysis || !profile) return;
    // Only worth keeping a version-history snapshot when overwriting a real,
    // trustworthy generation -- not the first-ever build (nothing to lose)
    // and not a stale/fabricated one (nothing trustworthy to keep).
    if (generation !== 'none' && generation !== null && !stale) {
      await snapshotGeneration(generation);
    }
    const atoms = buildProfileAtoms(profile);
    const selected = selectResumeContent(profile, posting.analysis, atoms);
    const { content, removedExperience } = await fitToOnePage(selected.content, selected.sourceMap);
    const next = newGeneration(id, 'resume', content, selected.sourceMap);
    await saveGeneration(next);
    setGeneration(next);
    setStale(false);
    setPageFitRemoved(removedExperience);
    setConfirmingRegenerate(false);
    listSnapshots(id, 'resume').then(setSnapshots);
  }

  function restorePageFitRemoved(entry: ExperienceEntry) {
    setGeneration((prev) => {
      if (!prev || prev === 'none') return prev;
      const content = prev.content as ResumeContent;
      const next = { ...prev, content: { ...content, experience: [...content.experience, entry] } };
      void saveGeneration(next);
      return next;
    });
    setPageFitRemoved((prev) => prev.filter((e) => e !== entry));
  }

  async function handleRestore(snapshot: GenerationSnapshot) {
    if (!id || generation === 'none' || generation === null) return;
    // Snapshot the current version too before overwriting it, so restoring
    // an old version doesn't itself lose whatever was just replaced.
    await snapshotGeneration(generation);
    const restored: Generation = { ...generation, content: snapshot.content, sourceMap: snapshot.sourceMap };
    await saveGeneration(restored);
    setGeneration(restored);
    setStale(false);
    setConfirmingRestoreId(null);
    listSnapshots(id, 'resume').then(setSnapshots);
  }

  function updateContent(content: Generation['content']) {
    setGeneration((prev) => {
      if (!prev || prev === 'none') return prev;
      const next = { ...prev, content };
      void saveGeneration(next);
      return next;
    });
  }

  if (posting === 'missing') {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-500">Posting not found.</p>
        <Link to="/jobs" className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-900 font-medium w-fit">
          <ArrowLeft size={15} />
          Back to Jobs
        </Link>
      </section>
    );
  }

  if (!posting || !profile || generation === null) {
    return <PageSkeleton cards={3} />;
  }

  if (!posting.analysis || posting.analysis.requirements.length === 0) {
    return (
      <section>
        <JobDetailHeader
          backHref={`/jobs/${posting.id}`}
          backLabel="Back to posting"
          postingId={posting.id}
          current="generate"
          analysisDone={false}
          matchingDone={false}
        />
        <p className="text-sm text-slate-500">
          This posting hasn't been analyzed yet.{' '}
          <Link to={`/jobs/${posting.id}`} className="underline hover:text-slate-900">
            Go run analysis first.
          </Link>
        </p>
      </section>
    );
  }

  if (posting.analysis.matches.length === 0) {
    return (
      <section>
        <JobDetailHeader
          backHref={`/jobs/${posting.id}/match`}
          backLabel="Back to matches"
          postingId={posting.id}
          current="generate"
          analysisDone={true}
          matchingDone={false}
        />
        <p className="text-sm text-slate-500">
          This posting hasn't been matched yet.{' '}
          <Link to={`/jobs/${posting.id}/match`} className="underline hover:text-slate-900">
            Go run matching first.
          </Link>
        </p>
      </section>
    );
  }

  const hasResume = generation !== 'none' && !stale;

  return (
    <div className="pb-16">
      <JobDetailHeader
        backHref={`/jobs/${posting.id}/match`}
        backLabel="Back to matches"
        postingId={posting.id}
        current="generate"
        analysisDone={Boolean(posting.analysis)}
        matchingDone={posting.analysis.matches.length > 0}
        subtabs={
          <div className="flex border-b border-slate-200 print:hidden">
            <button
              type="button"
              onClick={() => setTab('resume')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-3 border-b-2 -mb-px transition-colors ${
                tab === 'resume'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <FileText size={14} />
              Resume
            </button>
            <button
              type="button"
              onClick={() => setTab('coverLetter')}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold py-3 border-b-2 -mb-px transition-colors ${
                tab === 'coverLetter'
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Mail size={14} />
              Cover Letter
            </button>
          </div>
        }
        actions={
          tab === 'resume' ? (
            hasResume ? (
              !confirmingRegenerate ? (
                <>
                  {snapshots.length > 0 && (
                    <Btn size="sm" variant="secondary" onClick={() => setShowHistory((v) => !v)}>
                      <History size={13} />
                      History ({snapshots.length})
                    </Btn>
                  )}
                  <Btn size="sm" variant="secondary" onClick={() => setConfirmingRegenerate(true)}>
                    <Sparkles size={13} />
                    Regenerate
                  </Btn>
                  <Btn size="sm" onClick={() => window.print()}>
                    <Download size={13} />
                    Export PDF
                  </Btn>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600">This will overwrite your edits. Regenerate?</span>
                  <Btn size="sm" onClick={handleGenerate}>
                    Yes, regenerate
                  </Btn>
                  <Btn size="sm" variant="secondary" onClick={() => setConfirmingRegenerate(false)}>
                    Cancel
                  </Btn>
                </div>
              )
            ) : null
          ) : (
            <div ref={setCoverLetterActionsEl} className="flex items-center gap-2" />
          )
        }
      />

      {tab === 'coverLetter' ? (
        <CoverLetterSection posting={posting} profile={profile} actionsPortalTarget={coverLetterActionsEl} />
      ) : (
        <>
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
                    <span className="text-sm text-slate-700">
                      {new Date(snapshot.createdAt).toLocaleString()}
                    </span>
                    {confirmingRestoreId === snapshot.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600">Replace the current resume with this version?</span>
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

          {generation === 'none' ? (
            <Card className="p-10 flex flex-col items-center text-center gap-5 print:hidden">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg">
                <Sparkles size={22} className="text-white" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-900">Build a tailored resume</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
                  Selects and prioritizes your most relevant experience, projects, and skills for this
                  job -- every bullet stays exactly as you wrote it. Edit anything before exporting.
                </p>
              </div>
              <Btn onClick={handleGenerate} className="min-w-[140px] justify-center">
                <Sparkles size={14} />
                Build resume
              </Btn>
            </Card>
          ) : stale ? (
            <Card className="p-10 flex flex-col items-center text-center gap-5 print:hidden">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg">
                <AlertTriangle size={22} className="text-white" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-900">This resume needs to be rebuilt</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
                  It was built by an older version of this app that could rewrite bullet text -- some
                  of what it shows may not actually be in your profile. Rebuilding replaces it with
                  today's selection-only version, where every bullet stays exactly as you wrote it.
                </p>
              </div>
              <Btn onClick={handleGenerate} className="min-w-[140px] justify-center">
                <Sparkles size={14} />
                Rebuild resume
              </Btn>
            </Card>
          ) : (
            <>
              {pageFitRemoved.length > 0 && (
                <Card className="p-4 mb-5 print:hidden">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3 px-1">
                    Removed to fit one page
                  </p>
                  <div className="space-y-1.5">
                    {pageFitRemoved.map((entry, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-slate-200 flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <span className="text-sm text-slate-700">
                          {entry.title}
                          {entry.company && <span className="text-slate-400"> · {entry.company}</span>}
                        </span>
                        <Btn size="sm" variant="secondary" onClick={() => restorePageFitRemoved(entry)}>
                          Restore
                        </Btn>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start print:hidden">
                <ResumeEditor
                  value={generation.content as ResumeContent}
                  sourceMap={generation.sourceMap}
                  analysis={posting.analysis}
                  profile={profile}
                  onChange={updateContent}
                  onFocusBullet={setFocusedTarget}
                  navRequest={navRequest}
                />
                <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scroll-thin">
                  <ResumePrintView
                    content={generation.content as ResumeContent}
                    variant="preview"
                    focusedTarget={focusedTarget}
                    onNavigate={(target) => setNavRequest({ target, nonce: Date.now() })}
                  />
                </div>
              </div>
              <ResumePrintView content={generation.content as ResumeContent} />
            </>
          )}
        </>
      )}
    </div>
  );
}
