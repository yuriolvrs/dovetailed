// What this file is: the Jobs route's detail page (/jobs/:id). Shows one
// saved posting's text (editable), runs the LLM analysis on demand via
// analyzePosting's prompt + the shared llm.ts proxy client, and renders the
// result through AnalysisEditor. Edits autosave to Dexie the same way the
// Profile page does: list-shaped edits persist immediately, the large
// free-text posting body persists on blur.
// In plain terms: the screen for one saved job posting -- edit the pasted
// text, run the AI analysis, and fix up its answer if needed.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, Trash2 } from 'lucide-react';
import type { JobPosting, Profile } from '../types';
import { ARRANGEMENTS, deleteJobPosting, loadJobPosting, saveJobPosting } from '../lib/jobStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import {
  buildAnalyzePostingPrompt,
  isExtractedAnalysis,
  MAX_POSTING_CHARS,
  toJobAnalysis,
} from '../prompts/analyzePosting';
import { generateStructured, llmErrorMessage } from '../lib/llm';
import { useAutosaveIndicator } from '../lib/useAutosaveIndicator';
import { AnalysisEditor } from '../components/jobs/AnalysisEditor';
import { ApplicationTracker } from '../components/jobs/ApplicationTracker';
import { JobDetailHeader } from '../components/jobs/JobDetailHeader';
import { useToast } from '../components/ui/Toast';
import {
  Btn,
  Card,
  FieldInput,
  FieldSelect,
  PageSkeleton,
  SavedIndicator,
  UnsavedIndicator,
} from '../components/ui/primitives';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showUndo } = useToast();

  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Which of the blur-saved free-text fields currently differ from what's
  // persisted, so their labels can show an "Unsaved" indicator until blur.
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const { saved, pulse } = useAutosaveIndicator();

  const refresh = useCallback(() => {
    if (!id) return;
    loadJobPosting(id).then((p) => setPosting(p ?? 'missing'));
    loadProfile().then(setProfile);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Merges a change into state and persists immediately -- used for
  // list-shaped edits (analysis, arrangement) and, on blur, to commit the
  // free-text fields updated live below.
  function update(patch: Partial<JobPosting>) {
    setPosting((prev) => {
      if (!prev || prev === 'missing') return prev;
      const next = { ...prev, ...patch };
      void saveJobPosting(next);
      return next;
    });
    pulse();
  }

  // For free text (title/company/location/posting body): update on-screen
  // state on every keystroke, but only persist to Dexie on blur, to avoid a
  // write per character typed.
  function updateLive(patch: Partial<JobPosting>) {
    setPosting((prev) => (prev && prev !== 'missing' ? { ...prev, ...patch } : prev));
  }

  function markDirty(field: string) {
    setDirtyFields((prev) => new Set(prev).add(field));
  }

  function markClean(field: string) {
    setDirtyFields((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function handleAnalyze() {
    if (!posting || posting === 'missing' || !profile) return;
    setError(null);
    setStatus('loading');
    try {
      const prompt = buildAnalyzePostingPrompt(posting.rawText);
      const extracted = await generateStructured(prompt, isExtractedAnalysis, {
        temperature: 0.2,
        // Confirmed live against openai/gpt-oss-120b: 1500 usually survives
        // but with thin margin (reasoning tokens alone can run ~700+ for a
        // meaty posting) -- widened for headroom on harder postings.
        maxTokens: 2500,
      });
      update({ analysis: toJobAnalysis(extracted) });
      setStatus('idle');
    } catch (err) {
      setError(llmErrorMessage(err, 'Analysis'));
      setStatus('error');
    }
  }

  async function handleConfirmDelete() {
    if (!id || !posting || posting === 'missing') return;
    const deleted = posting;
    await deleteJobPosting(id);
    navigate('/');
    showUndo('Posting deleted.', async () => {
      await saveJobPosting(deleted);
      navigate(`/jobs/${id}`);
    });
  }

  if (posting === 'missing') {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">Posting not found.</p>
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium w-fit"
        >
          <ArrowLeft size={15} />
          Back to Jobs
        </Link>
      </section>
    );
  }

  if (!posting || !profile) {
    return <PageSkeleton cards={2} />;
  }

  const requiredCount = posting.analysis?.requirements.filter((r) => r.severity === 'required').length ?? 0;
  const preferredCount = posting.analysis?.requirements.filter((r) => r.severity === 'preferred').length ?? 0;

  return (
    <div className="pb-16">
      <JobDetailHeader
        backHref="/jobs"
        backLabel="Back to Jobs"
        postingId={posting.id}
        current="analysis"
        analysisDone={Boolean(posting.analysis)}
        matchingDone={Boolean(posting.analysis && posting.analysis.matches.length > 0)}
        actions={
          !confirmingDelete ? (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <Trash2 size={13} />
              Delete posting
            </Btn>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">Delete this posting?</span>
              <Btn
                size="sm"
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-500 focus:ring-red-600/30"
              >
                Yes, delete
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Btn>
            </div>
          )
        }
      />

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FieldInput
            label="Job Title"
            value={posting.title ?? ''}
            onChange={(title) => {
              updateLive({ title });
              markDirty('title');
            }}
            onBlur={() => {
              update({ title: posting.title });
              markClean('title');
            }}
            placeholder="Senior Frontend Engineer"
            unsaved={dirtyFields.has('title')}
          />
          <FieldInput
            label="Company"
            value={posting.company ?? ''}
            onChange={(company) => {
              updateLive({ company });
              markDirty('company');
            }}
            onBlur={() => {
              update({ company: posting.company });
              markClean('company');
            }}
            placeholder="Acme Corp"
            unsaved={dirtyFields.has('company')}
          />
          <FieldInput
            label="Location"
            value={posting.location ?? ''}
            onChange={(location) => {
              updateLive({ location });
              markDirty('location');
            }}
            onBlur={() => {
              update({ location: posting.location });
              markClean('location');
            }}
            placeholder="San Francisco, CA"
            unsaved={dirtyFields.has('location')}
          />
          <FieldSelect
            label="Arrangement"
            value={posting.arrangement ?? ''}
            onChange={(arrangement) => update({ arrangement })}
            options={ARRANGEMENTS}
            placeholder="Select…"
          />
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
          <ApplicationTracker posting={posting} onChange={update} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 items-start">
        <Card className="p-5 lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)] flex flex-col">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Posting Text
            </p>
            {dirtyFields.has('rawText') ? <UnsavedIndicator /> : <SavedIndicator visible={saved} />}
          </div>
          <textarea
            className="w-full flex-1 min-h-[16rem] text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-transparent resize-none outline-none border border-transparent rounded-xl focus:border-blue-300 dark:focus:border-blue-500 focus:bg-blue-50/20 dark:focus:bg-blue-500/10 px-2 py-2 transition-all overflow-y-auto"
            value={posting.rawText}
            onChange={(e) => {
              updateLive({ rawText: e.target.value });
              markDirty('rawText');
            }}
            onBlur={() => {
              update({ rawText: posting.rawText });
              markClean('rawText');
            }}
          />
          {posting.rawText.length > MAX_POSTING_CHARS && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 shrink-0">
              Only the first {MAX_POSTING_CHARS.toLocaleString()} characters are sent for analysis.
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)]">
          {!hasProfileContent(profile) && (
            <p className="text-sm text-slate-500 dark:text-slate-400 shrink-0">
              Add your experience or skills on the{' '}
              <Link to="/profile" className="underline hover:text-slate-900 dark:hover:text-slate-100">
                Profile page
              </Link>{' '}
              first — matches and gaps need something to compare against.
            </p>
          )}

          {!posting.analysis ? (
            <Card className="p-10 flex flex-col items-center text-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-white flex items-center justify-center shadow-lg">
                <Sparkles size={22} className="text-white dark:text-slate-900" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Analyze this posting</h3>
                <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed max-w-xs">
                  Extract requirements, find keyword matches, identify gaps — then edit anything
                  before generating documents.
                </p>
              </div>
              <Btn
                onClick={handleAnalyze}
                disabled={
                  status === 'loading' || posting.rawText.trim() === '' || !hasProfileContent(profile)
                }
                className="min-w-[140px] justify-center"
              >
                {status === 'loading' ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Run Analysis
                  </>
                )}
              </Btn>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </Card>
          ) : (
            <Card className="p-5 flex-1 min-h-0 flex flex-col">
              <div className="flex items-start justify-between mb-1 shrink-0">
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Analysis
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {posting.analysis.requirements.length} requirement
                    {posting.analysis.requirements.length !== 1 ? 's' : ''} —{' '}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {requiredCount} required
                    </span>
                    , {preferredCount} preferred
                  </p>
                </div>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={handleAnalyze}
                  disabled={status === 'loading' || !hasProfileContent(profile)}
                >
                  {status === 'loading' ? (
                    <div className="w-3.5 h-3.5 border-2 border-slate-300 dark:border-slate-600 border-t-slate-600 dark:border-t-slate-300 rounded-full animate-spin" />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  Reanalyze
                </Btn>
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3 mt-3 shrink-0">{error}</p>}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-1 -mr-1 mt-3">
                <AnalysisEditor value={posting.analysis} onChange={(analysis) => update({ analysis })} />
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <Btn
                  onClick={() => navigate(`/jobs/${posting.id}/match`)}
                  className="w-full justify-center"
                >
                  Continue to Matching
                  <ArrowRight size={14} />
                </Btn>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
