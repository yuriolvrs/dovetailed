// What this file is: the Jobs route's list page. Lets the user paste a new
// job posting (saved as a new record, then navigated to its detail page),
// and lists previously saved postings newest-first, linking to each one's
// detail page for analysis.
// In plain terms: the "Jobs" screen -- paste a new posting here, or open one
// you already saved.

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ChevronRight, Circle, Plus, X } from 'lucide-react';
import type { GenerationType, JobPosting } from '../types';
import {
  ARRANGEMENTS,
  deadlineCountdown,
  guessJobTitleAndCompany,
  listJobPostings,
  newJobPosting,
  postingLabel,
  saveJobPosting,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../lib/jobStore';
import { listGenerationTypesByPosting } from '../lib/genStore';
import { hasProfileContent, loadProfile } from '../lib/profileStore';
import { JobsFirstRun } from '../components/jobs/JobsFirstRun';
import { computeFitScore, fitScoreColor } from '../lib/matching/fitScore';
import {
  Badge,
  Btn,
  Card,
  FieldInput,
  FieldSelect,
  FieldTextarea,
  Modal,
  SectionTitle,
  Skeleton,
} from '../components/ui/primitives';

// The fit score's own color, as text rather than as a badge -- the score is
// the row's one number worth comparing down the list, so it carries the
// weight instead of sitting in a pill among other pills. Falls back to the
// analyzed/not-analyzed state when there is no score yet.
// In plain terms: picks the color for the "Fit 69%" text on a posting row.
function fitTextClass(score: number | null, analyzed: boolean): string {
  if (score === null) {
    return analyzed
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-slate-500 dark:text-slate-400';
  }
  return {
    green: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    red: 'text-red-600 dark:text-red-400',
    slate: 'text-slate-500 dark:text-slate-400',
  }[fitScoreColor(score)];
}

// One document's done/not-done state on a posting row.
// In plain terms: the little "Resume" / "Cover letter" tick on each row.
function DocumentState({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
      }`}
    >
      {done ? <CheckCircle size={11} /> : <Circle size={11} />}
      {label}
    </span>
  );
}

export default function JobsPage() {
  const navigate = useNavigate();
  const [postings, setPostings] = useState<JobPosting[] | null>(null);
  const [generationTypes, setGenerationTypes] = useState<Map<string, Set<GenerationType>>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  // True when the profile has nothing to match a posting against. Null until loaded.
  const [profileEmpty, setProfileEmpty] = useState<boolean | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [arrangement, setArrangement] = useState('');
  const [rawText, setRawText] = useState('');

  const refresh = useCallback(() => {
    listJobPostings().then(setPostings);
    listGenerationTypesByPosting().then(setGenerationTypes);
    loadProfile().then((profile) => setProfileEmpty(!hasProfileContent(profile)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // /jobs?add=1 (the Profile page's "Tailor to a job") opens the Add dialog
  // straight away, once the profile check has loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (profileEmpty === null || searchParams.get('add') !== '1') return;
    setSearchParams({}, { replace: true });
    handleAddClick();
    // handleAddClick only reads profileEmpty, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileEmpty, searchParams, setSearchParams]);

  // Asks about the profile first: a posting added with nothing to match it
  // against can only produce gaps.
  // In plain terms: if your profile is empty, the Add button explains that
  // before it opens the paste box.
  function handleAddClick() {
    if (profileEmpty) setGateOpen(true);
    else openModal();
  }

  function openModal() {
    setTitle('');
    setCompany('');
    setLocation('');
    setArrangement('');
    setRawText('');
    setModalOpen(true);
  }

  // Best-effort title/company pre-fill once the user has pasted something in
  // -- only fills fields that are still empty, never overwrites typed input.
  function handleRawTextBlur() {
    if (rawText.trim() === '') return;
    const guess = guessJobTitleAndCompany(rawText);
    if (title.trim() === '' && guess.title) setTitle(guess.title);
    if (company.trim() === '' && guess.company) setCompany(guess.company);
  }

  // Saves the pasted posting. With `build` set, goes straight to the Build
  // screen instead of the posting hub.
  // In plain terms: stores the posting, then either opens it or starts building.
  async function handleSave(build = false) {
    const posting = newJobPosting(rawText, {
      title: title.trim() || undefined,
      company: company.trim() || undefined,
      location: location.trim() || undefined,
      arrangement: arrangement || undefined,
    });
    await saveJobPosting(posting);
    setModalOpen(false);
    navigate(build ? `/jobs/${posting.id}/build` : `/jobs/${posting.id}`);
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Jobs</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Paste postings, run analysis, tailor your documents
          </p>
        </div>
        {postings !== null && postings.length > 0 && (
          <Btn onClick={handleAddClick}>
            <Plus size={14} />
            Add Job Posting
          </Btn>
        )}
      </div>

      <Modal open={gateOpen} onClose={() => setGateOpen(false)} className="max-w-md">
        <div className="p-5 space-y-2">
          <SectionTitle sub="A posting needs something to be matched against">Your profile isn't ready yet</SectionTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Add your skills, or bullets for a job or project, first. Without them, every requirement in a posting shows
            as a gap.
          </p>
        </div>
        <div className="p-5 pt-0 flex justify-end gap-2">
          <Btn
            variant="secondary"
            onClick={() => {
              setGateOpen(false);
              openModal();
            }}
          >
            Save a posting for later
          </Btn>
          <Btn onClick={() => navigate('/profile')}>Set up my profile</Btn>
        </div>
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} className="max-w-xl max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 shrink-0 flex items-start justify-between gap-3">
          <SectionTitle sub="Paste it in. It stays in this browser, not on a server.">
            Add a job posting
          </SectionTitle>
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            aria-label="Close"
            className="shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto scroll-thin">
          <FieldTextarea
            label="Posting Text"
            value={rawText}
            onChange={setRawText}
            onBlur={handleRawTextBlur}
            placeholder="Paste the whole posting: the role, responsibilities, requirements, location. Dovetailed reads the rest from it."
            rows={12}
            autoFocus
          />
          {/* The details are read from the posting, so they stay folded away
              unless the user wants to set them by hand. */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90" />
              <span className="shrink-0">Edit details</span>
              <span className="min-w-0 truncate font-normal text-slate-500 dark:text-slate-400">
                {[title.trim(), company.trim()].filter(Boolean).join(' · ') || 'Title, company and location are read from the posting'}
              </span>
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldInput
                  label="Job Title"
                  value={title}
                  onChange={setTitle}
                  placeholder="Senior Frontend Engineer"
                />
                <FieldInput label="Company" value={company} onChange={setCompany} placeholder="Acme Corp" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldInput
                  label="Location"
                  value={location}
                  onChange={setLocation}
                  placeholder="San Francisco, CA"
                />
                <FieldSelect
                  label="Arrangement"
                  value={arrangement}
                  onChange={setArrangement}
                  options={ARRANGEMENTS}
                  placeholder="Select…"
                />
              </div>
            </div>
          </details>
        </div>
        <div className="p-5 pt-0 flex flex-col-reverse gap-2 shrink-0 sm:flex-row sm:justify-end">
          <Btn variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Btn>
          <Btn variant="secondary" onClick={() => handleSave()} disabled={rawText.trim() === ''}>
            Save without building
          </Btn>
          <Btn onClick={() => handleSave(true)} disabled={rawText.trim() === '' || profileEmpty !== false}>
            <Plus size={14} />
            Build resume and cover letter
          </Btn>
        </div>
      </Modal>

      <div>
        {(postings === null || postings.length > 0) && (
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
            Saved Postings{postings !== null && ` — ${postings.length}`}
          </p>
        )}
        {postings === null ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : postings.length === 0 ? (
          <JobsFirstRun
            profileReady={profileEmpty === false}
            onAddPosting={handleAddClick}
            onSetUpProfile={() => navigate('/profile')}
          />
        ) : (
          <div className="space-y-3">
            {postings.map((posting) => {
              const company = posting.company?.trim();
              const location = posting.location?.trim();
              const locationArrangement =
                location && posting.arrangement
                  ? `${location} (${posting.arrangement})`
                  : location || posting.arrangement || '';
              const fitScore = computeFitScore(posting.analysis);
              const types = generationTypes.get(posting.id);

              return (
                <Link key={posting.id} to={`/jobs/${posting.id}`} className="block">
                  <Card className="group p-4 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-[0_4px_16px_rgba(15,23,42,0.1)] dark:hover:shadow-none transition-all">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-6">
                      {/* Identity: what this posting is, in three tiers. */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {posting.title?.trim() || postingLabel(posting)}
                          </h3>
                          {/* Only the exceptions get a badge -- an application
                              you're running, or a deadline running out. */}
                          {posting.status && (
                            <Badge color={STATUS_COLORS[posting.status]}>{STATUS_LABELS[posting.status]}</Badge>
                          )}
                          {posting.deadline && !posting.status && (
                            <Badge color={deadlineCountdown(posting.deadline).color}>
                              {deadlineCountdown(posting.deadline).label}
                            </Badge>
                          )}
                        </div>
                        {(company || locationArrangement) && (
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 truncate">
                            {[company, locationArrangement].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                          Saved {new Date(posting.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      {/* Progress: how far this posting has got, right-aligned
                          so a list of them reads as one column to compare. */}
                      <div className="shrink-0 flex flex-col items-start sm:items-end gap-1.5">
                        <span className={`text-sm font-semibold ${fitTextClass(fitScore, Boolean(posting.analysis))}`}>
                          {fitScore !== null
                            ? `Fit ${fitScore}%`
                            : posting.analysis
                              ? 'Analyzed'
                              : 'Not analyzed'}
                        </span>
                        <div className="flex items-center gap-3">
                          <DocumentState done={Boolean(types?.has('resume'))} label="Resume" />
                          <DocumentState done={Boolean(types?.has('coverLetter'))} label="Cover letter" />
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
