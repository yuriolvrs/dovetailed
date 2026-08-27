// What this file is: the Matching route's first screen (/jobs/:id/match/analyze)
// -- extract the posting's requirements with one LLM call, then edit them.
// This used to live on the posting hub, which is precisely what made Matching
// the route you were already inside the moment you opened a job. It belongs to
// Matching and only Matching: the Direct read never produces a requirement
// list, so nothing here is shared. The posting text sits alongside, read and
// edited through the same shared panel the hub uses, because you need the
// wording in front of you while correcting what was pulled out of it.
// In plain terms: the screen where the AI lists what the job is asking for and
// you fix up its answer, with the job ad next to it.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { JobPosting, Profile } from '../types';
import { loadJobPosting, saveJobPosting } from '../lib/jobStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import { buildAnalyzePostingPrompt, isExtractedAnalysis, toJobAnalysis } from '../prompts/analyzePosting';
import { generateStructured, llmErrorMessage } from '../lib/llm';
import { AnalysisEditor } from '../components/jobs/AnalysisEditor';
import { JobDetailHeader } from '../components/jobs/JobDetailHeader';
import { PostingTextPanel } from '../components/jobs/PostingTextPanel';
import { Btn, Card, PageSkeleton } from '../components/ui/primitives';

export default function AnalyzePostingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!id) return;
    loadJobPosting(id).then((p) => setPosting(p ?? 'missing'));
    loadProfile().then(setProfile);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function update(patch: Partial<JobPosting>) {
    setPosting((prev) => {
      if (!prev || prev === 'missing') return prev;
      const next = { ...prev, ...patch };
      void saveJobPosting(next);
      return next;
    });
  }

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

  if (posting === 'missing') {
    return (
      <section>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          That job posting no longer exists.{' '}
          <Link to="/" className="underline hover:text-slate-900 dark:hover:text-slate-100">
            Back to jobs.
          </Link>
        </p>
      </section>
    );
  }

  if (!posting || !profile) return <PageSkeleton cards={2} />;

  const requiredCount = posting.analysis?.requirements.filter((r) => r.severity === 'required').length ?? 0;
  const preferredCount = posting.analysis?.requirements.filter((r) => r.severity === 'preferred').length ?? 0;

  return (
    <div className="pb-16">
      <JobDetailHeader
        backHref={`/jobs/${posting.id}`}
        backLabel="Back to posting"
        postingId={posting.id}
        current="requirements"
        strategy="matched"
        analysisDone={Boolean(posting.analysis)}
        matchingDone={Boolean(posting.analysis && posting.analysis.matches.length > 0)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5 items-start">
        <PostingTextPanel
          posting={posting}
          onLiveChange={(rawText) => updateLive({ rawText })}
          onCommit={() => update({ rawText: posting.rawText })}
          className="lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)]"
        />

        <div className="flex flex-col gap-4 lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)]">
          {!hasProfileContent(profile) && (
            <p className="text-sm text-slate-600 dark:text-slate-400 shrink-0">
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
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Pull out the requirements
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs">
                  The AI reads the posting and lists what it asks for. You can edit, add, or remove anything before
                  matching it against your profile.
                </p>
              </div>
              <Btn
                onClick={handleAnalyze}
                disabled={status === 'loading' || posting.rawText.trim() === '' || !hasProfileContent(profile)}
                className="min-w-[140px] justify-center"
              >
                {status === 'loading' ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white dark:border-slate-900/30 dark:border-t-slate-900 rounded-full animate-spin" />
                    Reading…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Extract requirements
                  </>
                )}
              </Btn>
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </Card>
          ) : (
            <Card className="p-5 flex-1 min-h-0 flex flex-col">
              <div className="flex items-start justify-between mb-1 shrink-0">
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    Requirements
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {posting.analysis.requirements.length} requirement
                    {posting.analysis.requirements.length !== 1 ? 's' : ''} —{' '}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{requiredCount} required</span>,{' '}
                    {preferredCount} preferred
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
                  Re-extract
                </Btn>
              </div>
              {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3 mt-3 shrink-0">{error}</p>}
              <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-1 -mr-1 mt-3">
                <AnalysisEditor value={posting.analysis} onChange={(analysis) => update({ analysis })} />
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <Btn onClick={() => navigate(`/jobs/${posting.id}/match`)} className="w-full justify-center">
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
