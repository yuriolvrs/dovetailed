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
import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react';
import type { JobPosting, Profile } from '../types';
import {
  ARRANGEMENTS,
  deleteJobPosting,
  loadJobPosting,
  saveJobPosting,
} from '../lib/jobStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import {
  buildAnalyzePostingPrompt,
  isExtractedAnalysis,
  MAX_POSTING_CHARS,
  toJobAnalysis,
} from '../prompts/analyzePosting';
import { buildProfileAtoms } from '../lib/profileAtoms';
import { runMatching } from '../lib/matching/runMatching';
import { generateStructured, llmErrorMessage } from '../lib/llm';
import { AnalysisEditor } from '../components/jobs/AnalysisEditor';
import { JobStageTracker } from '../components/jobs/JobStageTracker';
import { Btn, Card, FieldInput, FieldSelect, ProgressBar } from '../components/ui/primitives';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number } | null>(null);

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
  }

  // For free text (title/company/location/posting body): update on-screen
  // state on every keystroke, but only persist to Dexie on blur, to avoid a
  // write per character typed.
  function updateLive(patch: Partial<JobPosting>) {
    setPosting((prev) => (prev && prev !== 'missing' ? { ...prev, ...patch } : prev));
  }

  async function handleAnalyze() {
    if (!posting || posting === 'missing' || !profile) return;
    setError(null);
    setStatus('loading');
    try {
      const prompt = buildAnalyzePostingPrompt(posting.rawText);
      const extracted = await generateStructured(prompt, isExtractedAnalysis, {
        temperature: 0.2,
        maxTokens: 1500,
      });
      update({ analysis: toJobAnalysis(extracted) });
      setStatus('idle');
    } catch (err) {
      setError(llmErrorMessage(err, 'Analysis'));
      setStatus('error');
    }
  }

  async function handleConfirmMatching() {
    if (!posting || posting === 'missing' || !posting.analysis || !profile) return;
    setError(null);
    setStatus('loading');
    setMatchProgress({ done: 0, total: posting.analysis.requirements.length });
    try {
      const atoms = buildProfileAtoms(profile);
      const matches = await runMatching(posting.analysis.requirements, atoms, (done, total) =>
        setMatchProgress({ done, total }),
      );
      const analysis = { ...posting.analysis, matches };
      const next = { ...posting, analysis };
      // Await the write (rather than the fire-and-forget update() used for
      // autosave elsewhere) -- we navigate immediately after, and the next
      // page reads this posting fresh from Dexie, so the write must land first.
      await saveJobPosting(next);
      setPosting(next);
      setStatus('idle');
      navigate(`/jobs/${posting.id}/match`);
    } catch (err) {
      setError(llmErrorMessage(err, 'Matching'));
      setStatus('error');
    } finally {
      setMatchProgress(null);
    }
  }

  async function handleConfirmDelete() {
    if (!id) return;
    await deleteJobPosting(id);
    navigate('/jobs');
  }

  if (posting === 'missing') {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-500">Posting not found.</p>
        <Link
          to="/jobs"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-900 transition-colors font-medium w-fit"
        >
          <ArrowLeft size={15} />
          Back to Jobs
        </Link>
      </section>
    );
  }

  if (!posting || !profile) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div className="pb-16">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <Link
            to="/jobs"
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-900 transition-colors font-medium shrink-0"
          >
            <ArrowLeft size={15} />
            Back to Jobs
          </Link>
          <JobStageTracker
            postingId={posting.id}
            current="analysis"
            analysisDone={Boolean(posting.analysis)}
            matchingDone={Boolean(posting.analysis && posting.analysis.matches.length > 0)}
            className=""
          />
        </div>
        {!confirmingDelete ? (
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => setConfirmingDelete(true)}
            className="text-slate-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={13} />
            Delete posting
          </Btn>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-600">Delete this posting?</span>
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
        )}
      </div>

      <Card className="p-4 mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FieldInput
            label="Job Title"
            value={posting.title ?? ''}
            onChange={(title) => updateLive({ title })}
            onBlur={() => update({ title: posting.title })}
            placeholder="Senior Frontend Engineer"
          />
          <FieldInput
            label="Company"
            value={posting.company ?? ''}
            onChange={(company) => updateLive({ company })}
            onBlur={() => update({ company: posting.company })}
            placeholder="Acme Corp"
          />
          <FieldInput
            label="Location"
            value={posting.location ?? ''}
            onChange={(location) => updateLive({ location })}
            onBlur={() => update({ location: posting.location })}
            placeholder="San Francisco, CA"
          />
          <FieldSelect
            label="Arrangement"
            value={posting.arrangement ?? ''}
            onChange={(arrangement) => update({ arrangement })}
            options={ARRANGEMENTS}
            placeholder="Select…"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 items-start">
        <Card className="p-5 lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)] flex flex-col">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-4 shrink-0">
            Posting Text
          </p>
          <textarea
            className="w-full flex-1 min-h-[16rem] text-sm text-slate-600 leading-relaxed bg-transparent resize-none outline-none border border-transparent rounded-xl focus:border-blue-300 focus:bg-blue-50/20 px-2 py-2 transition-all overflow-y-auto"
            value={posting.rawText}
            onChange={(e) => updateLive({ rawText: e.target.value })}
            onBlur={() => update({ rawText: posting.rawText })}
          />
          {posting.rawText.length > MAX_POSTING_CHARS && (
            <p className="text-xs text-slate-400 mt-2 shrink-0">
              Only the first {MAX_POSTING_CHARS.toLocaleString()} characters are sent for analysis.
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)]">
          {!hasProfileContent(profile) && (
            <p className="text-sm text-slate-500 shrink-0">
              Add your experience or skills on the{' '}
              <Link to="/profile" className="underline hover:text-slate-900">
                Profile page
              </Link>{' '}
              first — matches and gaps need something to compare against.
            </p>
          )}

          {!posting.analysis ? (
            <Card className="p-10 flex flex-col items-center text-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg">
                <Sparkles size={22} className="text-white" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-slate-900">Analyze this posting</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
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
              {error && <p className="text-xs text-red-600">{error}</p>}
            </Card>
          ) : (
            <Card className="p-5 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                  Analysis
                </p>
                <div className="flex items-center gap-2">
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={handleAnalyze}
                    disabled={status === 'loading' || !hasProfileContent(profile)}
                  >
                    {status === 'loading' ? (
                      <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    Reanalyze
                  </Btn>
                  {posting.analysis.matches.length === 0 && (
                    <Btn
                      size="sm"
                      onClick={handleConfirmMatching}
                      disabled={
                        status === 'loading' ||
                        !hasProfileContent(profile) ||
                        posting.analysis.requirements.length === 0
                      }
                    >
                      {status === 'loading' && matchProgress ? 'Matching…' : 'Confirm & run matching'}
                    </Btn>
                  )}
                </div>
              </div>
              {matchProgress && (
                <div className="mb-4 shrink-0">
                  <ProgressBar done={matchProgress.done} total={matchProgress.total} />
                </div>
              )}
              {error && <p className="text-xs text-red-600 mb-3 shrink-0">{error}</p>}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-1 -mr-1">
                <AnalysisEditor value={posting.analysis} onChange={(analysis) => update({ analysis })} />
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
