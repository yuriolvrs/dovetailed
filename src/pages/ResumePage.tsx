// What this file is: the Resume route's page (/jobs/:id/resume). Builds a
// tailored resume from the posting's confirmed matches via
// selectResumeContent.ts -- a pure, synchronous selection/reordering of the
// profile's own content, no LLM call -- then hands the result to
// ResumeEditor for field-level editing, autosaving to Dexie via genStore.ts.
// Regenerating is an explicit, confirmed action (overwrites the single
// stored generation for this posting, same "Re-run" pattern as matching)
// since it discards manual edits -- but the version it's about to overwrite
// is snapshotted into history first (genStore.ts), so a "History" panel lets
// the user restore an earlier version instead of losing it for good. Export
// is a plain window.print() against the hidden ResumePrintView layout -- no
// PDF library needed.
// In plain terms: the screen where you build a tailored resume for a job,
// edit it, roll back to an earlier version if needed, and export it to PDF.

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Download, History, Sparkles } from 'lucide-react';
import type { Generation, GenerationSnapshot, JobPosting, Profile, ResumeContent, ResumeDensity } from '../types';
import { loadJobPosting } from '../lib/jobStore';
import { loadProfile, saveProfile } from '../lib/profileStore';
import { buildProfileAtoms } from '../lib/profileAtoms';
import { loadGeneration, listSnapshots, newGeneration, saveGeneration, snapshotGeneration } from '../lib/genStore';
import { isResumeContentVerbatim, selectResumeContent } from '../lib/generation/selectResumeContent';
import { ResumeEditor } from '../components/resume/ResumeEditor';
import { ResumePrintView } from '../components/resume/ResumePrintView';
import { Btn, Card, FieldSelect } from '../components/ui/primitives';

const DENSITY_OPTIONS: readonly ResumeDensity[] = ['compact', 'standard', 'detailed'];
const DENSITY_LABEL: Record<ResumeDensity, string> = {
  compact: 'Compact',
  standard: 'Standard',
  detailed: 'Detailed',
};

export default function ResumePage() {
  const { id } = useParams<{ id: string }>();

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

  const refresh = useCallback(() => {
    if (!id) return;
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
    const { content, sourceMap } = selectResumeContent(profile, posting.analysis, atoms);
    const next = newGeneration(id, 'resume', content, sourceMap);
    await saveGeneration(next);
    setGeneration(next);
    setStale(false);
    setConfirmingRegenerate(false);
    listSnapshots(id, 'resume').then(setSnapshots);
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

  function handleDensityChange(label: string) {
    const density = (Object.keys(DENSITY_LABEL) as ResumeDensity[]).find((d) => DENSITY_LABEL[d] === label);
    if (!density || !profile) return;
    const next = { ...profile, resumeDensity: density };
    setProfile(next);
    void saveProfile(next);
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
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  if (!posting.analysis || posting.analysis.matches.length === 0) {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-500">
          This posting hasn't been matched yet.{' '}
          <Link to={`/jobs/${posting.id}`} className="underline hover:text-slate-900">
            Go run analysis and matching first.
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div className="pb-16">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link to={`/jobs/${posting.id}/match`} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-900 font-medium">
          <ArrowLeft size={15} />
          Back to matches
        </Link>
        {generation !== 'none' && !stale && (
          <div className="flex items-center gap-2">
            {!confirmingRegenerate ? (
              <>
                <FieldSelect
                  value={DENSITY_LABEL[profile.resumeDensity ?? 'standard']}
                  onChange={handleDensityChange}
                  options={DENSITY_OPTIONS.map((d) => DENSITY_LABEL[d])}
                  className="w-32"
                />
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
            )}
          </div>
        )}
      </div>

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
          <div className="print:hidden">
            <ResumeEditor
              value={generation.content as ResumeContent}
              sourceMap={generation.sourceMap}
              onChange={updateContent}
            />
          </div>
          <ResumePrintView content={generation.content as ResumeContent} />
        </>
      )}
    </div>
  );
}
