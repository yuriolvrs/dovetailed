// What this file is: the posting hub (/jobs/:id) -- one job's shared, neutral
// ground. It owns only what belongs to the posting itself (title, company,
// location, arrangement, application status, deadline, the pasted text) and
// nothing belonging to either generation route. That is deliberate: the
// analysis pass used to live here, which made Matching the route you were
// already inside the moment you opened a job, and left the Direct read able to
// appear only by replacing the whole screen. Extracting requirements now lives
// on Matching's own first screen, so both routes start from here on equal
// terms.
//
// The page has two states, switched on whether any work exists yet. Before:
// the posting text and one "Build resume and cover letter" action, which runs
// the whole pipeline on the Build screen. The step-by-step requirements route
// and the Direct read stay reachable as quiet links, not as a choice you must
// make first. After: the text folds to a summary and the page leads with
// opening the documents.
// In plain terms: the first screen for a job -- its details and text, plus one
// button that builds both documents, or a way back to them once built.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileText, ListChecks, Mail, MessageCircleQuestion, Sparkles, Trash2 } from 'lucide-react';
import type { JobPosting } from '../types';
import { ARRANGEMENTS, deleteJobPosting, loadJobPosting, saveJobPosting } from '../lib/jobStore';
import { loadGeneration } from '../lib/genStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import { ApplicationTracker } from '../components/jobs/ApplicationTracker';
import { JobDetailHeader } from '../components/jobs/JobDetailHeader';
import { PostingTextPanel } from '../components/jobs/PostingTextPanel';
import { useToast } from '../components/ui/Toast';
import { computeFitScore, fitScoreColor } from '../lib/matching/fitScore';
import { Badge, Btn, Card, FieldInput, FieldSelect, PageSkeleton } from '../components/ui/primitives';

// Quiet text link used for the secondary ways in.
const linkClass =
  'inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 underline hover:text-slate-900 dark:hover:text-slate-100';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showUndo } = useToast();

  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  // Whether a matched resume has been built, and whether the profile has
  // anything to build from. Null until loaded.
  const [hasDocuments, setHasDocuments] = useState<boolean | null>(null);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    if (!id) return;
    loadJobPosting(id).then((p) => setPosting(p ?? 'missing'));
    loadGeneration(id, 'resume', 'matched').then((g) => setHasDocuments(Boolean(g)));
    loadProfile().then((p) => setProfileReady(hasProfileContent(p)));
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
        <p className="text-sm text-slate-600 dark:text-slate-400">Posting not found.</p>
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium w-fit"
        >
          <ArrowLeft size={15} />
          Back to Jobs
        </Link>
      </section>
    );
  }

  if (!posting || hasDocuments === null || profileReady === null) return <PageSkeleton cards={2} />;

  const matchingStarted = Boolean(posting.analysis);
  const directStarted = Boolean(posting.holisticSelection);
  // Which state the hub is in: a first visit, or a return visit to work that
  // already exists.
  const started = matchingStarted || directStarted || hasDocuments;
  const noText = posting.rawText.trim() === '';
  const fit = computeFitScore(posting.analysis);
  // Requirements met fully or partly, once matching has run.
  const matchedCount =
    posting.analysis && posting.analysis.matches.length > 0
      ? posting.analysis.matches.filter((m) => m.status === 'full' || m.status === 'partial').length
      : null;

  return (
    <div className="pb-16">
      <JobDetailHeader
        posting={posting}
        current="posting"
        // The steps follow the route actually in use; Matching is the default
        // the Build button runs.
        strategy={directStarted && !matchingStarted && !hasDocuments ? 'holistic' : 'matched'}
        analysisDone={matchingStarted}
        matchingDone={Boolean(posting.analysis && posting.analysis.matches.length > 0)}
        selectionDone={directStarted}
        actions={
          !confirmingDelete ? (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
              className="text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <Trash2 size={13} />
              Delete posting
            </Btn>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">Delete this posting?</span>
              <Btn size="sm" variant="dangerSolid" onClick={handleConfirmDelete}>
                Yes, delete
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Btn>
            </div>
          )
        }
      />

      {started ? (
        // Return visit: the posting has been read, so it folds away and the
        // documents lead.
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your documents</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {hasDocuments
                    ? 'Open one to edit, check and export it.'
                    : matchingStarted
                      ? 'The build stopped before both documents were ready. Finishing it reuses the steps already done.'
                      : 'Build a resume and cover letter from your matches to this posting.'}
                </p>
              </div>
              {fit !== null && <Badge color={fitScoreColor(fit)}>Fit {fit}%</Badge>}
            </div>
            {hasDocuments ? (
              // One button per document, each opening its own tab, so the
              // cover letter is one click away instead of behind the resume.
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Btn onClick={() => navigate(`/jobs/${posting.id}/documents`)}>
                  <FileText size={14} />
                  Resume
                </Btn>
                <Btn variant="secondary" onClick={() => navigate(`/jobs/${posting.id}/documents?tab=coverLetter`)}>
                  <Mail size={14} />
                  Cover letter
                </Btn>
                <Btn variant="secondary" onClick={() => navigate(`/jobs/${posting.id}/documents?tab=interviewPrep`)}>
                  <MessageCircleQuestion size={14} />
                  Interview prep
                </Btn>
              </div>
            ) : (
              <div className="mt-4">
                <Btn onClick={() => navigate(`/jobs/${posting.id}/build`)} disabled={noText || !profileReady}>
                  {matchingStarted ? 'Finish building' : 'Build resume and cover letter'}
                  <ArrowRight size={14} />
                </Btn>
              </div>
            )}
            {(matchingStarted || directStarted) && (
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-x-5 gap-y-2">
                {matchingStarted && (
                  <Link to={`/jobs/${posting.id}/match`} className={linkClass}>
                    <ListChecks size={12} />
                    {matchedCount !== null
                      ? `Review matches (${matchedCount} of ${posting.analysis!.requirements.length} requirements met)`
                      : 'Review matches'}
                  </Link>
                )}
                {directStarted && (
                  <Link to={`/jobs/${posting.id}/direct`} className={linkClass}>
                    <Sparkles size={12} />
                    Open the Direct read
                  </Link>
                )}
              </div>
            )}
          </Card>
          <PostingTextPanel
            posting={posting}
            variant="summary"
            onLiveChange={(rawText) => updateLive({ rawText })}
            onCommit={() => update({ rawText: posting.rawText })}
          />
        </div>
      ) : (
        // First visit: the posting gets the room, next to one action.
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-5 items-start">
          <PostingTextPanel
            posting={posting}
            onLiveChange={(rawText) => updateLive({ rawText })}
            onCommit={() => update({ rawText: posting.rawText })}
            className="lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)]"
          />

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Build your resume and cover letter</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Dovetailed reads the posting, matches each requirement to your profile, then builds both documents.
              Everything comes from your profile; nothing is invented. You can edit both afterwards.
            </p>
            <Btn
              className="w-full justify-center mt-4"
              disabled={noText || !profileReady}
              onClick={() => navigate(`/jobs/${posting.id}/build`)}
            >
              Build resume and cover letter
              <ArrowRight size={14} />
            </Btn>
            {noText ? (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2.5 text-center">Paste the job posting first.</p>
            ) : (
              !profileReady && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2.5 text-center">
                  Your profile has nothing to match against yet.{' '}
                  <Link to="/profile" className="underline hover:text-slate-900 dark:hover:text-slate-100">
                    Set up your profile
                  </Link>{' '}
                  first.
                </p>
              )
            )}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div>
                <Link to={`/jobs/${posting.id}/match/analyze`} className={linkClass}>
                  <ListChecks size={12} />
                  Check the requirements step by step instead
                </Link>
              </div>
              <div>
                <Link to={`/jobs/${posting.id}/direct`} className={linkClass}>
                  <Sparkles size={12} />
                  Or let the AI read the whole posting at once (Direct read)
                </Link>
              </div>
            </div>
          </Card>
        </div>
      )}
      {/* The posting's own details come after the main action, so on a phone
          the Build / Open button is not a screen and a half down. */}
      <Card className="p-4 mt-5">
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
    </div>
  );
}
