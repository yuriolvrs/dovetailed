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
// The page has two states, switched on whether either route has produced
// anything yet. Before: the posting text takes the room it deserves and a
// decision card asks which route to use, since that choice wants the posting in
// front of you. After: the text folds to a summary and the two routes become
// standing status rows, because by then you have read the posting and came back
// to open your work or run the other route.
// In plain terms: the first screen for a job -- its details and text, plus the
// choice of which of the two ways to build documents, or the status of both
// once you've used them.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ListChecks, Sparkles, Trash2 } from 'lucide-react';
import type { GenerationStrategy, JobPosting } from '../types';
import { ARRANGEMENTS, deleteJobPosting, loadJobPosting, saveJobPosting } from '../lib/jobStore';
import { ApplicationTracker } from '../components/jobs/ApplicationTracker';
import { PostingTextPanel } from '../components/jobs/PostingTextPanel';
import { useToast } from '../components/ui/Toast';
import { Badge, Btn, Card, FieldInput, FieldSelect, PageSkeleton } from '../components/ui/primitives';

/**
 * The two routes, described in the user's terms rather than the mechanism's.
 * `steps` is what the route's own stepper will show, stated up front so the
 * cost of each is visible before it is chosen rather than discovered inside it.
 */
const ROUTES: {
  strategy: GenerationStrategy;
  name: string;
  Icon: typeof ListChecks;
  blurb: string;
  steps: string[];
  cta: string;
  href: (id: string) => string;
}[] = [
  {
    strategy: 'matched',
    name: 'Matching',
    Icon: ListChecks,
    blurb:
      'Pull the requirements out of the posting, then check each one against your profile. You review every pairing and can add or reject evidence yourself.',
    steps: ['Requirements', 'Matches', 'Documents'],
    cta: 'Extract requirements',
    href: (id) => `/jobs/${id}/match/analyze`,
  },
  {
    strategy: 'holistic',
    name: 'Direct read',
    Icon: Sparkles,
    blurb:
      'The AI reads the whole posting and your whole profile at once, picks what to feature, and explains why. One pass, no requirement list.',
    steps: ['Choices', 'Documents'],
    cta: 'Read & choose',
    href: (id) => `/jobs/${id}/direct`,
  },
];

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showUndo } = useToast();

  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Which route the decision card has selected. Only used before either route
  // has run; afterwards the hub shows both as status rows and there is nothing
  // to pre-select.
  const [choice, setChoice] = useState<GenerationStrategy>('matched');
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!id) return;
    loadJobPosting(id).then((p) => setPosting(p ?? 'missing'));
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

  if (!posting) return <PageSkeleton cards={2} />;

  const matchingStarted = Boolean(posting.analysis);
  const directStarted = Boolean(posting.holisticSelection);
  // Which state the hub is in: a first visit that has to make a choice, or a
  // return visit to work that already exists.
  const started = matchingStarted || directStarted;

  const statusOf = (strategy: GenerationStrategy) =>
    strategy === 'matched' ? matchingStarted : directStarted;

  return (
    <div className="pb-16">
      <div className="mb-5 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors font-medium w-fit rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft size={15} />
          Back to Jobs
        </Link>
        {!confirmingDelete ? (
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
        )}
      </div>

      <Card className="p-4 mb-5">
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

      {started ? (
        // Return visit: the posting has been read, so it folds away and the two
        // routes become the page.
        <div className="space-y-4">
          <PostingTextPanel
            posting={posting}
            variant="summary"
            onLiveChange={(rawText) => updateLive({ rawText })}
            onCommit={() => update({ rawText: posting.rawText })}
          />
          <div className="space-y-3">
            {ROUTES.map((route) => {
              const done = statusOf(route.strategy);
              return (
                <Card key={route.strategy} className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                        <route.Icon size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{route.name}</h2>
                          {done ? (
                            <Badge color="green">
                              <Check size={11} />
                              Started
                            </Badge>
                          ) : (
                            <Badge>Not run</Badge>
                          )}
                        </div>
                        {/* Shown whatever the state. Hiding it once a route had
                            run collapsed that row to a bare title and badge,
                            and made the two rows different shapes -- which is
                            the opposite of what this hub is for. */}
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-1.5 max-w-prose">
                          {route.blurb}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Btn
                        variant={done ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => navigate(route.href(posting.id))}
                      >
                        {done ? 'Open' : route.cta}
                        <ArrowRight size={13} />
                      </Btn>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        // First visit: nothing has run, so the posting gets the room and the
        // choice is made with it on screen.
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-5 items-start">
          <PostingTextPanel
            posting={posting}
            onLiveChange={(rawText) => updateLive({ rawText })}
            onCommit={() => update({ rawText: posting.rawText })}
            className="lg:sticky lg:top-[70px] lg:h-[calc(100vh-88px)]"
          />

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">How should we read this?</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Both build a resume and cover letter from your real profile, and neither invents anything. You can run
              the other one later and compare.
            </p>

            <fieldset className="mt-4 space-y-2.5">
              <legend className="sr-only">Which route to use</legend>
              {ROUTES.map((route) => {
                const selected = choice === route.strategy;
                return (
                  <label
                    key={route.strategy}
                    className={`flex gap-3 items-start rounded-xl border p-3.5 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${
                      selected
                        ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800/60'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="route"
                      className="sr-only"
                      checked={selected}
                      onChange={() => setChoice(route.strategy)}
                    />
                    <span
                      aria-hidden
                      className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                        selected
                          ? 'border-[5px] border-slate-900 dark:border-slate-100'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <route.Icon size={13} className="text-slate-700 dark:text-slate-200 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{route.name}</span>
                      </span>
                      <span className="block text-xs text-slate-600 dark:text-slate-400 leading-relaxed mt-1">
                        {route.blurb}
                      </span>
                      <span className="block text-[11px] text-slate-600 dark:text-slate-400 mt-1.5">
                        {route.steps.length} steps · {route.steps.join(' → ')}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <Btn
              className="w-full justify-center mt-4"
              disabled={posting.rawText.trim() === ''}
              onClick={() => navigate(ROUTES.find((r) => r.strategy === choice)!.href(posting.id))}
            >
              Continue
              <ArrowRight size={14} />
            </Btn>
            {posting.rawText.trim() === '' && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2.5 text-center">
                Paste the job posting first.
              </p>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
