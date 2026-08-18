// What this file is: the master-detail Matching review screen (/jobs/:id/match).
// Left pane lists requirements in posting order with a status dot; the right
// pane shows the selected requirement's matched profile evidence (with
// reject/swap, and the ability to attach additional evidence from any
// profile atom -- skills, experience, or project bullets -- even when one is
// already confirmed) or an explicit empty state for gaps, plus an
// always-visible "Additional information" section for evidence not tied to
// any one requirement. Evidence is always a ProfileAtom reference -- never
// free text -- so there's nothing here to hallucinate.
// In plain terms: the screen where you check the AI's read on how well your
// profile covers each requirement, and fix it up where needed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, FileText, Sparkles } from 'lucide-react';
import type { JobPosting, MatchStatus, Profile, ProfileAtom, RequirementMatch } from '../types';
import { loadJobPosting, saveJobPosting } from '../lib/jobStore';
import { loadProfile, saveProfile } from '../lib/profileStore';
import { buildProfileAtoms } from '../lib/profileAtoms';
import { runMatching, statusAfterReject } from '../lib/matching/runMatching';
import { computeFitScore } from '../lib/matching/fitScore';
import { llmErrorMessage } from '../lib/llm';
import { useAutosaveIndicator } from '../lib/useAutosaveIndicator';
import { EvidenceModal } from '../components/jobs/EvidenceModal';
import { JobDetailHeader } from '../components/jobs/JobDetailHeader';
import { useToast } from '../components/ui/Toast';
import { RemoveItemButton } from '../components/EditableList';
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  PageSkeleton,
  ProgressBar,
  SavedIndicator,
  SectionTitle,
} from '../components/ui/primitives';
import { FileDropzone } from '../components/ui/FileDropzone';
import { useFileText } from '../lib/files/useFileText';

const SOURCE_BADGE_LABEL: Record<ProfileAtom['source'], string> = {
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  additional: 'Additional',
};

const STATUS_DOT: Record<MatchStatus, string> = {
  full: 'bg-emerald-500',
  partial: 'bg-amber-500',
  // gap_unverified gets its own color (not the same red as gap_no_candidates)
  // since it means something meaningfully different: candidates were found,
  // the LLM just didn't confirm any of them -- worth a second look, not a
  // dead end.
  gap_no_candidates: 'bg-red-500',
  gap_unverified: 'bg-orange-500',
};

const STATUS_LABEL: Record<MatchStatus, string> = {
  full: 'Full match',
  partial: 'Partial match',
  gap_no_candidates: 'Gap',
  gap_unverified: 'Gap — possible matches found',
};

// atom.sourceLabel is "Experience: Title, Company" / "Project: Name" / etc --
// strips the "Source: " prefix to get just the entry title, so it can be
// shown next to the source Badge without repeating it.
function atomSourceTitle(atom: ProfileAtom): string {
  const separatorIndex = atom.sourceLabel.indexOf(': ');
  return separatorIndex === -1 ? atom.sourceLabel : atom.sourceLabel.slice(separatorIndex + 2);
}

type PickerTarget = { mode: 'swap'; atomId: string } | null;

export default function MatchingReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showUndo } = useToast();

  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [additionalInfoModalOpen, setAdditionalInfoModalOpen] = useState(false);
  const infoDoc = useFileText('Reading that document');
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [confirmingRematch, setConfirmingRematch] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [rematchProgress, setRematchProgress] = useState<{ done: number; total: number } | null>(null);
  const [expandedAtomIds, setExpandedAtomIds] = useState<Set<string>>(new Set());
  const rematchAbortRef = useRef<AbortController | null>(null);
  // Rail filter -- narrows the requirement list to one status bucket so a
  // long posting's gaps/partials can be triaged without scrolling past
  // everything that's already fine. 'gap' covers both gap statuses (no
  // candidates / unverified), matching the simplified 3-way breakdown shown
  // in the fit-score band above the rail.
  const [statusFilter, setStatusFilter] = useState<'all' | 'full' | 'partial' | 'gap'>('all');
  // Which of the two full-width sections below the requirement/evidence
  // panes is showing -- they used to be two separate stacked cards; now one
  // card with a tab switch, to cut page length.
  const [infoTab, setInfoTab] = useState<'evidence' | 'additional'>('evidence');
  const { saved, pulse } = useAutosaveIndicator();

  const refresh = useCallback(() => {
    if (!id) return;
    loadJobPosting(id).then((p) => setPosting(p ?? 'missing'));
    loadProfile().then(setProfile);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requirements = useMemo(
    () => (posting && posting !== 'missing' ? [...(posting.analysis?.requirements ?? [])].sort((a, b) => a.order - b.order) : []),
    [posting],
  );

  useEffect(() => {
    if (selectedId === null && requirements.length > 0) {
      setSelectedId(requirements[0].id);
    }
  }, [requirements, selectedId]);

  const atoms: ProfileAtom[] = useMemo(() => (profile ? buildProfileAtoms(profile) : []), [profile]);
  const atomsById = useMemo(() => new Map(atoms.map((a) => [a.id, a])), [atoms]);

  // Every profile atom currently attached as evidence to at least one
  // requirement, with which requirement(s) it's attached to -- recomputed
  // live from posting.analysis.matches, so a reject/swap above updates this
  // immediately without any extra plumbing. Order follows `atoms` (profile
  // section order) for stability.
  const evidenceRows = useMemo(() => {
    if (!posting || posting === 'missing' || !posting.analysis) return [];
    const requirementsById = new Map(posting.analysis.requirements.map((r) => [r.id, r]));
    const usage = new Map<string, string[]>();
    for (const match of posting.analysis.matches) {
      const requirement = requirementsById.get(match.requirementId);
      if (!requirement) continue;
      for (const atomId of match.atomIds) {
        const list = usage.get(atomId) ?? [];
        list.push(requirement.text);
        usage.set(atomId, list);
      }
    }
    return atoms
      .filter((atom) => usage.has(atom.id))
      .map((atom) => ({ atom, requirementTexts: usage.get(atom.id)! }));
  }, [posting, atoms]);

  const matchByRequirementId = useMemo(() => {
    const matches = posting && posting !== 'missing' ? (posting.analysis?.matches ?? []) : [];
    return new Map(matches.map((m) => [m.requirementId, m]));
  }, [posting]);

  // Simplified 3-way bucket (both gap statuses collapse to 'gap') for the
  // fit-score band and the rail's filter chips -- the fuller 4-status detail
  // still drives the individual status dots and the selected requirement's
  // own detail panel.
  function statusBucket(status: MatchStatus): 'full' | 'partial' | 'gap' {
    if (status === 'full') return 'full';
    if (status === 'partial') return 'partial';
    return 'gap';
  }

  const statusCounts = useMemo(() => {
    let full = 0;
    let partial = 0;
    let gap = 0;
    for (const requirement of requirements) {
      const status = matchByRequirementId.get(requirement.id)?.status ?? 'gap_no_candidates';
      const bucket = statusBucket(status);
      if (bucket === 'full') full++;
      else if (bucket === 'partial') partial++;
      else gap++;
    }
    return { full, partial, gap, total: requirements.length };
  }, [requirements, matchByRequirementId]);

  const filteredRequirements = useMemo(() => {
    if (statusFilter === 'all') return requirements;
    return requirements.filter((r) => {
      const status = matchByRequirementId.get(r.id)?.status ?? 'gap_no_candidates';
      return statusBucket(status) === statusFilter;
    });
  }, [requirements, matchByRequirementId, statusFilter]);

  const reviewedCount = useMemo(
    () => requirements.filter((r) => matchByRequirementId.has(r.id)).length,
    [requirements, matchByRequirementId],
  );

  const usedAtomIds = useMemo(() => {
    const matches = posting && posting !== 'missing' ? (posting.analysis?.matches ?? []) : [];
    return new Set(matches.flatMap((m) => m.atomIds));
  }, [posting]);

  const additionalInfoTexts = useMemo(() => new Set(profile?.additionalInfo ?? []), [profile]);

  // Additional information picker: browses the same atoms as the requirement
  // picker (EvidenceModal decides which sources are selectable), but greys
  // out/labels "Added" whichever ones are already used as evidence for some
  // requirement or already copied into Additional information itself -- same
  // dim treatment the requirement picker uses, rather than hiding them.
  const additionalInfoDisabledIds = useMemo(
    () =>
      new Set(
        atoms.filter((atom) => usedAtomIds.has(atom.id) || additionalInfoTexts.has(atom.text)).map((a) => a.id),
      ),
    [atoms, usedAtomIds, additionalInfoTexts],
  );

  function toggleExpanded(atomId: string) {
    setExpandedAtomIds((prev) => {
      const next = new Set(prev);
      if (next.has(atomId)) {
        next.delete(atomId);
      } else {
        next.add(atomId);
      }
      return next;
    });
  }

  function updateMatches(updater: (matches: RequirementMatch[]) => RequirementMatch[]) {
    setPosting((prev) => {
      if (!prev || prev === 'missing' || !prev.analysis) return prev;
      const matches = updater(prev.analysis.matches);
      const next = { ...prev, analysis: { ...prev.analysis, matches } };
      void saveJobPosting(next);
      return next;
    });
    pulse();
  }

  function updateProfile(patch: Partial<Profile>) {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void saveProfile(next);
      return next;
    });
    pulse();
  }

  // Re-runs the full matching pass from scratch -- an explicit action (not
  // triggered by navigation) since it overwrites any manual reject/swap/add-
  // evidence edits with a fresh auto-match.
  async function handleRematch() {
    if (!posting || posting === 'missing' || !posting.analysis || !profile) return;
    setRematchError(null);
    setRematchStatus('loading');
    setRematchProgress({ done: 0, total: posting.analysis.requirements.length });
    const controller = new AbortController();
    rematchAbortRef.current = controller;
    try {
      const freshAtoms = buildProfileAtoms(profile);
      const matches = await runMatching(
        posting.analysis.requirements,
        freshAtoms,
        (done, total) => setRematchProgress({ done, total }),
        controller.signal,
      );
      const next = { ...posting, analysis: { ...posting.analysis, matches } };
      await saveJobPosting(next);
      setPosting(next);
      setRematchStatus('idle');
      setConfirmingRematch(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setRematchStatus('idle');
        setConfirmingRematch(false);
      } else {
        setRematchError(llmErrorMessage(err, 'Re-matching'));
        setRematchStatus('error');
      }
    } finally {
      setRematchProgress(null);
      rematchAbortRef.current = null;
    }
  }

  function handleCancelRematch() {
    rematchAbortRef.current?.abort();
  }

  // Wipes every requirement back to an unmatched gap -- no LLM call, just a
  // clean slate for manually attaching evidence via "Add evidence" instead.
  async function handleClearMatches() {
    if (!posting || posting === 'missing' || !posting.analysis) return;
    const previousMatches = posting.analysis.matches;
    const next = { ...posting, analysis: { ...posting.analysis, matches: [] } };
    await saveJobPosting(next);
    setPosting(next);
    setConfirmingClear(false);
    showUndo('Matches cleared.', async () => {
      const restored = { ...next, analysis: { ...next.analysis!, matches: previousMatches } };
      await saveJobPosting(restored);
      setPosting(restored);
    });
  }

  if (posting === 'missing') {
    return (
      <section className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">Posting not found.</p>
        <Link
          to="/jobs"
          className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 font-medium w-fit"
        >
          <ArrowLeft size={15} />
          Back to Jobs
        </Link>
      </section>
    );
  }

  if (!posting || !profile) {
    return <PageSkeleton cards={3} />;
  }

  if (!posting.analysis || posting.analysis.requirements.length === 0) {
    return (
      <section>
        <JobDetailHeader
          backHref={`/jobs/${posting.id}`}
          backLabel="Back to posting"
          postingId={posting.id}
          current="matching"
          analysisDone={false}
          matchingDone={false}
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This posting hasn't been analyzed yet.{' '}
          <Link to={`/jobs/${posting.id}`} className="underline hover:text-slate-900 dark:hover:text-slate-100">
            Go run analysis first.
          </Link>
        </p>
      </section>
    );
  }

  // The handlers below are hoisted function declarations, so they don't
  // inherit the `!profile` early return's narrowing -- they read it through
  // this already-narrowed alias instead.
  const currentProfile: Profile = profile;
  const selected = requirements.find((r) => r.id === selectedId) ?? requirements[0];
  const selectedMatch: RequirementMatch =
    matchByRequirementId.get(selected.id) ?? { requirementId: selected.id, status: 'gap_no_candidates', atomIds: [] };

  function selectRequirement(reqId: string) {
    setSelectedId(reqId);
    setPickerTarget(null);
    setEvidenceModalOpen(false);
  }

  function handleReject(atomId: string) {
    const updated = statusAfterReject(selectedMatch, selected.text, atoms, atomId);
    updateMatches((matches) => matches.map((m) => (m.requirementId === selected.id ? updated : m)));
  }

  // Adds an atom as evidence for the selected requirement without disturbing
  // any evidence already confirmed -- works whether the requirement is
  // currently a gap (first evidence) or already full/partial (extra evidence).
  function addEvidence(atomId: string) {
    updateMatches((matches) => {
      const existing = matches.find((m) => m.requirementId === selected.id);
      if (!existing) {
        return [...matches, { requirementId: selected.id, status: 'full', atomIds: [atomId] }];
      }
      if (existing.atomIds.includes(atomId)) return matches;
      const wasGap = existing.status === 'gap_no_candidates' || existing.status === 'gap_unverified';
      const updated: RequirementMatch = {
        ...existing,
        atomIds: [...existing.atomIds, atomId],
        status: wasGap ? 'full' : existing.status,
        consideredAtomIds: wasGap ? undefined : existing.consideredAtomIds,
      };
      return matches.map((m) => (m.requirementId === selected.id ? updated : m));
    });
  }

  function replaceAtom(oldAtomId: string, newAtomId: string) {
    const atomIds = selectedMatch.atomIds.map((id) => (id === oldAtomId ? newAtomId : id));
    updateMatches((matches) => matches.map((m) => (m.requirementId === selected.id ? { ...m, atomIds } : m)));
  }

  function addAdditionalInfo(text: string) {
    updateProfile({ additionalInfo: [...currentProfile.additionalInfo, text] });
  }

  function createAdditionalAtom(text: string): string {
    const nextAdditionalInfo = [...currentProfile.additionalInfo, text];
    updateProfile({ additionalInfo: nextAdditionalInfo });
    return buildProfileAtoms({ ...currentProfile, additionalInfo: nextAdditionalInfo }).find(
      (a) => a.source === 'additional' && a.text === text,
    )!.id;
  }

  function handleAddEvidenceCreateNew(text: string) {
    addEvidence(createAdditionalAtom(text));
  }

  function handleAddAdditionalInfoExisting(atomId: string) {
    const atom = atomsById.get(atomId);
    if (atom) addAdditionalInfo(atom.text);
  }

  const isGap = selectedMatch.status === 'gap_no_candidates' || selectedMatch.status === 'gap_unverified';
  const swapAtomId = pickerTarget?.mode === 'swap' ? pickerTarget.atomId : null;
  const swapAtom = swapAtomId ? atomsById.get(swapAtomId) : undefined;
  const fitScore = computeFitScore(posting.analysis);

  return (
    <div className="pb-16">
      <JobDetailHeader
        backHref={`/jobs/${posting.id}`}
        backLabel="Back to posting"
        postingId={posting.id}
        current="matching"
        analysisDone={Boolean(posting.analysis)}
        matchingDone={posting.analysis.matches.length > 0}
        actions={
          !confirmingRematch && !confirmingClear ? (
            <>
              <SavedIndicator visible={saved} />
              <Btn size="sm" variant="danger" onClick={() => setConfirmingClear(true)}>
                Clear matches
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingRematch(true)} disabled={rematchStatus === 'loading'}>
                <Sparkles size={13} />
                Re-run matching
              </Btn>
            </>
          ) : confirmingClear ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">This clears every requirement's evidence. Clear matches?</span>
              <Btn size="sm" variant="danger" onClick={handleClearMatches}>
                Yes, clear
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingClear(false)}>
                Cancel
              </Btn>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">This will overwrite any manual edits. Re-run matching?</span>
              <Btn size="sm" onClick={handleRematch} disabled={rematchStatus === 'loading'}>
                {rematchStatus === 'loading' ? 'Matching…' : 'Yes, re-run'}
              </Btn>
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingRematch(false)} disabled={rematchStatus === 'loading'}>
                Cancel
              </Btn>
            </div>
          )
        }
      />
      {rematchProgress && (
        <div className="mb-4 max-w-xs ml-auto flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar done={rematchProgress.done} total={rematchProgress.total} />
          </div>
          <Btn size="sm" variant="secondary" onClick={handleCancelRematch}>
            Cancel
          </Btn>
        </div>
      )}
      {rematchError && <p className="text-xs text-red-600 dark:text-red-400 mb-4">{rematchError}</p>}

      {fitScore !== null && (
        <Card className="p-5 mb-5">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center shrink-0">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 leading-none">{fitScore}%</span>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1.5">
                Overall fit
              </span>
            </div>
            <div className="flex-1 space-y-2.5">
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                {statusCounts.total > 0 && (
                  <>
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(statusCounts.full / statusCounts.total) * 100}%` }}
                    />
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${(statusCounts.partial / statusCounts.total) * 100}%` }}
                    />
                    <div
                      className="h-full bg-red-500"
                      style={{ width: `${(statusCounts.gap / statusCounts.total) * 100}%` }}
                    />
                  </>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  {statusCounts.full} Full match
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  {statusCounts.partial} Partial
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  {statusCounts.gap} Gap{statusCounts.gap !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        <Card className="p-3 lg:sticky lg:top-20">
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2 mb-3">
            Requirements
          </p>
          <div className="flex gap-1.5 px-1 mb-3 flex-wrap">
            {(
              [
                ['all', 'All', statusCounts.total],
                ['gap', 'Gaps', statusCounts.gap],
                ['partial', 'Partial', statusCounts.partial],
                ['full', 'Full', statusCounts.full],
              ] as const
            ).map(([key, label, count]) => {
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    active
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                  }`}
                >
                  {label} {count}
                </button>
              );
            })}
          </div>
          <div className="space-y-1">
            {filteredRequirements.length === 0 ? (
              <p className="text-xs text-slate-300 dark:text-slate-600 text-center py-6">No requirements in this filter.</p>
            ) : (
              filteredRequirements.map((requirement) => {
                const match = matchByRequirementId.get(requirement.id);
                const status: MatchStatus = match?.status ?? 'gap_no_candidates';
                const isSelected = requirement.id === selected.id;
                return (
                  <button
                    key={requirement.id}
                    type="button"
                    onClick={() => selectRequirement(requirement.id)}
                    className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    <span className="line-clamp-2">{requirement.text}</span>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle sub={STATUS_LABEL[selectedMatch.status]}>{selected.text}</SectionTitle>

            {!isGap && (
              <div className="space-y-2">
                {selectedMatch.atomIds.map((atomId) => {
                  const atom = atomsById.get(atomId);
                  if (!atom) {
                    return (
                      <div
                        key={atomId}
                        className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400"
                      >
                        This evidence no longer matches your profile — re-run matching to refresh it.
                      </div>
                    );
                  }
                  return (
                    <div
                      key={atomId}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Badge color="blue">{SOURCE_BADGE_LABEL[atom.source]}</Badge>
                        <span className="text-sm text-slate-700 dark:text-slate-300 break-words">{atom.text}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Btn size="sm" variant="secondary" onClick={() => setPickerTarget({ mode: 'swap', atomId })}>
                          Swap
                        </Btn>
                        <Btn size="sm" variant="danger" onClick={() => handleReject(atomId)}>
                          Remove
                        </Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isGap && (
              <EmptyState className="mb-3">
                {selectedMatch.status === 'gap_no_candidates'
                  ? 'No matching experience found for this requirement.'
                  : "We found possible profile matches, but couldn't confirm any of them satisfy this requirement."}
              </EmptyState>
            )}

            {selectedMatch.status === 'gap_unverified' && (selectedMatch.consideredAtomIds?.length ?? 0) > 0 && (
              <div className="space-y-2 mb-3">
                <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1">
                  Considered but not confirmed
                </p>
                {selectedMatch.consideredAtomIds!.map((atomId) => {
                  const atom = atomsById.get(atomId);
                  if (!atom) return null;
                  return (
                    <div
                      key={atomId}
                      className="rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10 flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Badge color="blue">{SOURCE_BADGE_LABEL[atom.source]}</Badge>
                        <span className="text-sm text-slate-700 dark:text-slate-300 break-words">{atom.text}</span>
                      </div>
                      <Btn size="sm" variant="secondary" onClick={() => addEvidence(atomId)}>
                        Use as evidence
                      </Btn>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Always available -- lets the user attach more than one piece of
                evidence (skills, experience, or project bullets alike) to a
                requirement, even one that's already matched. */}
            <div className={isGap ? '' : 'mt-3'}>
              <Btn size="sm" variant="secondary" onClick={() => setEvidenceModalOpen(true)}>
                Add evidence
              </Btn>
            </div>
          </Card>
        </div>
      </div>

      {/* Full-width, belongs to neither pane -- these are opposite sets by
          definition (an atom is either used by some requirement or it isn't).
          Used to be two separate stacked full-width cards; now one card with
          a tab switch (same idiom as Generate's Resume/Cover Letter tabs),
          so reviewing both doesn't mean scrolling past everything. */}
      <Card className="p-5 mt-5">
        <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4 -mt-1">
          <button
            type="button"
            onClick={() => setInfoTab('evidence')}
            className={`flex-1 text-center text-sm font-semibold py-2.5 border-b-2 -mb-px transition-colors ${
              infoTab === 'evidence'
                ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            Evidence in use ({evidenceRows.length})
          </button>
          <button
            type="button"
            onClick={() => setInfoTab('additional')}
            className={`flex-1 text-center text-sm font-semibold py-2.5 border-b-2 -mb-px transition-colors ${
              infoTab === 'additional'
                ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            Additional info ({profile.additionalInfo.length})
          </button>
        </div>

        {infoTab === 'evidence' && (
          <>
            <p className="text-xs text-slate-400 dark:text-slate-500 -mt-1 mb-3">
              Profile items currently attached as evidence to at least one requirement
            </p>
            {evidenceRows.length === 0 ? (
              <p className="text-xs text-slate-300 dark:text-slate-600 py-2">No evidence attached yet.</p>
            ) : (
              <div className="space-y-1.5">
                {evidenceRows.map(({ atom, requirementTexts }) => {
                  const expanded = expandedAtomIds.has(atom.id);
                  return (
                    <div key={atom.id} className="rounded-xl border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(atom.id)}
                        className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <Badge color="blue">{SOURCE_BADGE_LABEL[atom.source]}</Badge>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">
                              {atomSourceTitle(atom)}
                            </p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 break-words mt-0.5">{atom.text}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            matched {requirementTexts.length}×
                          </span>
                          <ChevronDown
                            size={14}
                            className={`text-slate-300 dark:text-slate-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </button>
                      {expanded && (
                        <div className="px-3 pb-3 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                          {requirementTexts.map((text, i) => (
                            <p key={i} className="text-xs text-slate-500 dark:text-slate-400">
                              — {text}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {infoTab === 'additional' && (
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500 -mt-1 mb-3">
              Accomplishments not tied to a specific requirement — eligible evidence for any future
              matching
            </p>
            {profile.additionalInfo.length === 0 ? (
              <button
                type="button"
                onClick={() => setAdditionalInfoModalOpen(true)}
                className="w-full py-8 text-center text-xs text-slate-300 dark:text-slate-600 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl hover:border-slate-200 dark:hover:border-slate-700 hover:text-slate-400 dark:hover:text-slate-500 transition-colors"
              >
                Add accomplishment
              </button>
            ) : (
              <>
                <div className="space-y-1.5">
                  {profile.additionalInfo.map((text, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge color="blue">Additional</Badge>
                        <span className="text-sm text-slate-700 dark:text-slate-300">{text}</span>
                      </div>
                      <RemoveItemButton
                        onClick={() =>
                          updateProfile({ additionalInfo: profile.additionalInfo.filter((_, i) => i !== index) })
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Btn size="sm" variant="secondary" onClick={() => setAdditionalInfoModalOpen(true)}>
                    Add accomplishment
                  </Btn>
                </div>
              </>
            )}
            {/* Attaching a document (a performance review, a project write-up)
                adds its text as one accomplishment, editable like any other. */}
            <div className="mt-3">
              <FileDropzone
                compact
              busy={infoDoc.busy}
              label="Attach a document instead"
              onFile={(f) =>
                infoDoc.read(f, (text) =>
                  updateProfile({ additionalInfo: [...profile.additionalInfo, text] }),
                )
              }
            />
            {infoDoc.error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{infoDoc.error}</p>}
            </div>
          </div>
        )}
      </Card>

      <div className="sticky bottom-4 mt-5">
        <Card className="p-3 pl-4 flex items-center justify-between shadow-lg">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {reviewedCount} of {requirements.length} requirement{requirements.length !== 1 ? 's' : ''} reviewed
          </span>
          <Btn onClick={() => navigate(`/jobs/${posting.id}/generate`)}>
            <FileText size={14} />
            Generate
          </Btn>
        </Card>
      </div>

      <EvidenceModal
        open={evidenceModalOpen}
        onClose={() => setEvidenceModalOpen(false)}
        title="Add evidence"
        subtitle={selected.text}
        confirmedAtoms={selectedMatch.atomIds.map((atomId) => atomsById.get(atomId)).filter((a): a is ProfileAtom => Boolean(a))}
        atoms={atoms}
        onSelectExisting={addEvidence}
        onCreateNew={handleAddEvidenceCreateNew}
        onRemoveExisting={handleReject}
      />

      <EvidenceModal
        open={swapAtomId !== null}
        onClose={() => setPickerTarget(null)}
        title="Swap evidence"
        subtitle={selected.text}
        confirmedAtoms={swapAtom ? [swapAtom] : []}
        confirmedLabel="Replacing"
        atoms={atoms.filter((a) => !selectedMatch.atomIds.includes(a.id))}
        closeOnSelect
        onSelectExisting={(newAtomId) => swapAtomId && replaceAtom(swapAtomId, newAtomId)}
        onCreateNew={(text) => swapAtomId && replaceAtom(swapAtomId, createAdditionalAtom(text))}
      />

      <EvidenceModal
        open={additionalInfoModalOpen}
        onClose={() => setAdditionalInfoModalOpen(false)}
        title="Add accomplishment"
        atoms={atoms}
        disabledAtomIds={additionalInfoDisabledIds}
        newEntryPlaceholder="Or write new accomplishment…"
        onSelectExisting={handleAddAdditionalInfoExisting}
        onCreateNew={addAdditionalInfo}
      />
    </div>
  );
}
