// What this file is: the Build progress screen (/jobs/:id/build). It starts
// the posting's build through buildRunner, shows each step as it happens, and
// opens the finished documents. A failed step shows its error and a retry
// that resumes there. The build keeps running if the user leaves this screen.
// In plain terms: the screen you watch after pressing Build. It ticks off the
// steps and takes you to your resume and cover letter when they are ready.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, Circle } from 'lucide-react';
import type { JobPosting, Profile } from '../types';
import { loadJobPosting } from '../lib/jobStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import { llmErrorMessage } from '../lib/llm';
import { PIPELINE_STEPS, type PipelineStep } from '../lib/pipeline/buildDocuments';
import { getBuild, startBuild, stopBuild, subscribeBuild, type BuildState } from '../lib/pipeline/buildRunner';
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

// Puts a failed build's error into words. fetch rejects with a TypeError
// when nothing answers at all, which reads as "Failed to fetch", so that case
// says what actually happened instead.
// In plain terms: the message shown when a build fails.
function buildErrorMessage(err: unknown): string {
  return err instanceof TypeError && /fetch|network|load failed/i.test(err.message)
    ? 'Could not reach the AI service. Check your connection, then use Retry from here. Steps that finished are kept.'
    : llmErrorMessage(err, 'Building your documents');
}

export default function BuildPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [build, setBuild] = useState<BuildState | null>(null);

  // Watches this posting's build. The build itself lives in buildRunner, so
  // leaving this screen does not stop it.
  useEffect(() => {
    if (!id) return;
    return subscribeBuild(id, setBuild);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    Promise.all([loadJobPosting(id), loadProfile()]).then(([p, prof]) => {
      setPosting(p ?? 'missing');
      setProfile(prof);
      // Join a build already running (the user came back to this screen);
      // otherwise start one. Finished steps are saved, so a fresh start
      // resumes where the last one ended.
      const existing = getBuild(id);
      if (existing?.status === 'running') setBuild(existing);
      else if (p && hasProfileContent(prof)) startBuild(p, prof);
    });
  }, [id]);

  // The resume is ready before the letter, so open the documents as soon as
  // it is saved. The Cover Letter tab there shows the letter being written.
  const resumeReady = build?.status === 'done' || Boolean(build?.doneSteps.includes('resume'));
  useEffect(() => {
    if (id && resumeReady) navigate(`/jobs/${id}/documents`, { replace: true });
  }, [resumeReady, id, navigate]);

  // Reloads the posting first, so a retry starts from what the failed run saved.
  // In plain terms: tries again from the step that stopped.
  async function handleRetry() {
    if (!id || !profile) return;
    const fresh = await loadJobPosting(id);
    if (fresh) startBuild(fresh, profile);
  }

  const status = build?.status ?? 'running';
  const progress = build?.progress ?? null;
  const doneSteps = new Set(build?.doneSteps ?? []);
  const error = build?.status === 'error' ? buildErrorMessage(build.error) : null;

  if (posting === 'missing') {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        That job posting no longer exists.{' '}
        <Link to="/jobs" className="underline hover:text-slate-900 dark:hover:text-slate-100">
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
            Your resume and cover letter use only what is in your profile. You can look at other pages while it
            runs; keep this tab open until it finishes.
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
              <Btn variant="secondary" onClick={() => id && stopBuild(id)}>
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
