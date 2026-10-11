// What this file is: the Build progress screen (/jobs/:id/build). It runs the
// buildDocuments pipeline for a posting, shows each step as it happens, and
// opens the finished documents. A failed step shows its error and a retry
// that resumes there. Stop uses the same abort signal matching already takes.
// In plain terms: the screen you watch after pressing Build. It ticks off the
// steps and takes you to your resume and cover letter when they are ready.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Circle } from 'lucide-react';
import type { JobPosting, Profile } from '../types';
import { loadJobPosting } from '../lib/jobStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import { llmErrorMessage } from '../lib/llm';
import { buildDocuments, PIPELINE_STEPS, type PipelineProgress, type PipelineStep } from '../lib/pipeline/buildDocuments';
import { Btn, Card, PageSkeleton, ProgressBar } from '../components/ui/primitives';
import { JobDetailHeader } from '../components/jobs/JobDetailHeader';
import type { StageKey } from '../components/jobs/JobStageTracker';

// Which step of the job's stepper each build step belongs to, so the
// stepper moves along with the build.
const STEP_STAGE: Record<PipelineStep, StageKey> = {
  read: 'requirements',
  match: 'matches',
  resume: 'documents',
  coverLetter: 'documents',
};

const STEP_LABELS: Record<PipelineStep, string> = {
  read: 'Reading the posting',
  match: 'Matching to your profile',
  resume: 'Building your resume',
  coverLetter: 'Writing your cover letter',
};

export default function BuildPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<'running' | 'error' | 'stopped'>('running');
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [doneSteps, setDoneSteps] = useState<Set<PipelineStep>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);

  // Runs the pipeline from the posting as saved. Finished work is saved, so
  // calling this again after an error or a stop resumes at the step that failed.
  // In plain terms: starts the build, or carries on after a failure.
  const run = useCallback(async (p: JobPosting, prof: Profile) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStatus('running');
    setDoneSteps(new Set());
    try {
      await buildDocuments(p, prof, {
        signal: controller.signal,
        onProgress: setProgress,
        onStepDone: (step) => setDoneSteps((prev) => new Set(prev).add(step)),
      });
      navigate(`/jobs/${p.id}/documents`, { replace: true });
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus('stopped');
      } else {
        // fetch rejects with a TypeError when nothing answers at all, which
        // reads as "Failed to fetch" -- say what actually happened instead.
        setError(
          err instanceof TypeError && /fetch|network|load failed/i.test(err.message)
            ? 'Could not reach the AI service. Check your connection, then use Retry from here. Steps that finished are kept.'
            : llmErrorMessage(err, 'Building your documents'),
        );
        setStatus('error');
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (!id) return;
    Promise.all([loadJobPosting(id), loadProfile()]).then(([p, prof]) => {
      setPosting(p ?? 'missing');
      setProfile(prof);
    });
    return () => abortRef.current?.abort();
  }, [id]);

  useEffect(() => {
    if (startedRef.current || !posting || posting === 'missing' || !profile) return;
    startedRef.current = true;
    if (hasProfileContent(profile)) void run(posting, profile);
  }, [posting, profile, run]);

  // Reloads the posting first, so a retry starts from what the failed run saved.
  // In plain terms: tries again from the step that stopped.
  async function handleRetry() {
    if (!id || !profile) return;
    const fresh = await loadJobPosting(id);
    if (fresh) void run(fresh, profile);
  }

  if (posting === 'missing') {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        That job posting no longer exists.{' '}
        <Link to="/" className="underline hover:text-slate-900 dark:hover:text-slate-100">
          Back to jobs.
        </Link>
      </p>
    );
  }
  if (!posting || !profile) return <PageSkeleton cards={1} />;

  const current = progress?.step;

  return (
    <div className="pb-16">
      <JobDetailHeader
        posting={posting}
        current={current ? STEP_STAGE[current] : 'requirements'}
        strategy="matched"
        analysisDone={Boolean(posting.analysis) || doneSteps.has('read')}
        matchingDone={doneSteps.has('match')}
      />
      <Card className="max-w-xl mx-auto p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Building your resume and cover letter
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Your resume and cover letter use only what is in your profile. Keep this page open until it finishes;
            leaving stops the build, and finished steps are kept.
          </p>
        </div>

        {!hasProfileContent(profile) ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your profile has nothing to match this job against yet.{' '}
            <Link to="/profile" className="underline hover:text-slate-900 dark:hover:text-slate-100">
              Set up your profile
            </Link>{' '}
            first.
          </p>
        ) : (
          <ol className="space-y-3">
            {PIPELINE_STEPS.map((step) => {
              const done = doneSteps.has(step);
              const active = status === 'running' && !done && current === step;
              return (
                <li key={step} className="space-y-2">
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      done
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : active
                          ? 'text-slate-900 dark:text-slate-100 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {done ? <CheckCircle size={15} /> : <Circle size={15} />}
                    {STEP_LABELS[step]}
                  </div>
                  {active && step === 'match' && progress?.total ? (
                    <ProgressBar done={progress.done ?? 0} total={progress.total} />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {status === 'stopped' && <p className="text-sm text-slate-600 dark:text-slate-400">Stopped.</p>}

        {hasProfileContent(profile) && (
          <div className="flex gap-2">
            {status === 'running' ? (
              <Btn variant="secondary" onClick={() => abortRef.current?.abort()}>
                Stop
              </Btn>
            ) : (
              <Btn onClick={handleRetry}>{status === 'error' ? 'Retry from here' : 'Resume build'}</Btn>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
