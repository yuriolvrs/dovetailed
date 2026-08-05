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
import { computeFitScore, fitScoreColor } from '../lib/matching/fitScore';
import { llmErrorMessage } from '../lib/llm';
import { EvidenceModal } from '../components/jobs/EvidenceModal';
import { JobStageTracker } from '../components/jobs/JobStageTracker';
import { useToast } from '../components/ui/Toast';
import { RemoveItemButton } from '../components/EditableList';
import { Badge, Btn, Card, PageSkeleton, ProgressBar, SectionTitle } from '../components/ui/primitives';

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
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [confirmingRematch, setConfirmingRematch] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [rematchStatus, setRematchStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [rematchProgress, setRematchProgress] = useState<{ done: number; total: number } | null>(null);
  const [expandedAtomIds, setExpandedAtomIds] = useState<Set<string>>(new Set());
  const rematchAbortRef = useRef<AbortController | null>(null);

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
  }

  function updateProfile(patch: Partial<Profile>) {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void saveProfile(next);
      return next;
    });
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
        <p className="text-sm text-slate-500">Posting not found.</p>
        <Link to="/jobs" className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-900 font-medium w-fit">
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
      <section className="space-y-3">
        <JobStageTracker
          postingId={posting.id}
          current="matching"
          analysisDone={false}
          matchingDone={false}
          className=""
        />
        <p className="text-sm text-slate-500">
          This posting hasn't been analyzed yet.{' '}
          <Link to={`/jobs/${posting.id}`} className="underline hover:text-slate-900">
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <Link to={`/jobs/${posting.id}`} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-900 font-medium shrink-0">
            <ArrowLeft size={15} />
            Back to posting
          </Link>
          <JobStageTracker
            postingId={posting.id}
            current="matching"
            analysisDone={Boolean(posting.analysis)}
            matchingDone={posting.analysis.matches.length > 0}
            className=""
          />
        </div>
        {!confirmingRematch && !confirmingClear ? (
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="danger" onClick={() => setConfirmingClear(true)}>
              Clear matches
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setConfirmingRematch(true)} disabled={rematchStatus === 'loading'}>
              <Sparkles size={13} />
              Re-run matching
            </Btn>
          </div>
        ) : confirmingClear ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-600">This clears every requirement's evidence. Clear matches?</span>
            <Btn size="sm" variant="danger" onClick={handleClearMatches}>
              Yes, clear
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Btn>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-600">This will overwrite any manual edits. Re-run matching?</span>
            <Btn size="sm" onClick={handleRematch} disabled={rematchStatus === 'loading'}>
              {rematchStatus === 'loading' ? 'Matching…' : 'Yes, re-run'}
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setConfirmingRematch(false)} disabled={rematchStatus === 'loading'}>
              Cancel
            </Btn>
          </div>
        )}
      </div>
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
      {rematchError && <p className="text-xs text-red-600 mb-4">{rematchError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
        <Card className="p-3 lg:sticky lg:top-20">
          <div className="flex items-center justify-between mb-3 px-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              Requirements
            </p>
            {fitScore !== null && <Badge color={fitScoreColor(fitScore)}>Fit score: {fitScore}%</Badge>}
          </div>
          <div className="space-y-1">
            {requirements.map((requirement) => {
              const match = matchByRequirementId.get(requirement.id);
              const status: MatchStatus = match?.status ?? 'gap_no_candidates';
              const isSelected = requirement.id === selected.id;
              return (
                <button
                  key={requirement.id}
                  type="button"
                  onClick={() => selectRequirement(requirement.id)}
                  className={`w-full text-left flex items-start gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${
                    isSelected ? 'bg-slate-900 text-white' : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                  <span className="line-clamp-2">{requirement.text}</span>
                </button>
              );
            })}
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
                      <div key={atomId} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                        This evidence no longer matches your profile — re-run matching to refresh it.
                      </div>
                    );
                  }
                  return (
                    <div
                      key={atomId}
                      className="rounded-xl border border-slate-200 flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Badge color="blue">{SOURCE_BADGE_LABEL[atom.source]}</Badge>
                        <span className="text-sm text-slate-700 break-words">{atom.text}</span>
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
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-sm text-slate-500 mb-3">
                {selectedMatch.status === 'gap_no_candidates'
                  ? 'No matching experience found for this requirement.'
                  : "We found possible profile matches, but couldn't confirm any of them satisfy this requirement."}
              </div>
            )}

            {selectedMatch.status === 'gap_unverified' && (selectedMatch.consideredAtomIds?.length ?? 0) > 0 && (
              <div className="space-y-2 mb-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                  Considered but not confirmed
                </p>
                {selectedMatch.consideredAtomIds!.map((atomId) => {
                  const atom = atomsById.get(atomId);
                  if (!atom) return null;
                  return (
                    <div
                      key={atomId}
                      className="rounded-xl border border-orange-200 bg-orange-50 flex items-start justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <Badge color="blue">{SOURCE_BADGE_LABEL[atom.source]}</Badge>
                        <span className="text-sm text-slate-700 break-words">{atom.text}</span>
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
          definition (an atom is either used by some requirement or it isn't),
          kept visually distinct with separate headers and a divider. */}
      <Card className="p-5 mt-5">
        <SectionTitle sub="Profile items currently attached as evidence to at least one requirement">
          Evidence in use
        </SectionTitle>
        {evidenceRows.length === 0 ? (
          <p className="text-xs text-slate-300 py-2">No evidence attached yet.</p>
        ) : (
          <div className="space-y-1.5">
            {evidenceRows.map(({ atom, requirementTexts }) => {
              const expanded = expandedAtomIds.has(atom.id);
              return (
                <div key={atom.id} className="rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(atom.id)}
                    className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left"
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <Badge color="blue">{SOURCE_BADGE_LABEL[atom.source]}</Badge>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-600 truncate">
                          {atomSourceTitle(atom)}
                        </p>
                        <p className="text-sm text-slate-700 break-words mt-0.5">{atom.text}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400">
                        matched {requirementTexts.length}×
                      </span>
                      <ChevronDown
                        size={14}
                        className={`text-slate-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3 space-y-1 border-t border-slate-100 pt-2">
                      {requirementTexts.map((text, i) => (
                        <p key={i} className="text-xs text-slate-500">
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

        <div className="mt-6 pt-6 border-t border-slate-100">
          <SectionTitle sub="Accomplishments not tied to a specific requirement -- eligible evidence for any future matching">
            Additional information
          </SectionTitle>
          {profile.additionalInfo.length === 0 ? (
            <button
              type="button"
              onClick={() => setAdditionalInfoModalOpen(true)}
              className="w-full py-8 text-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl hover:border-slate-200 hover:text-slate-400 transition-colors"
            >
              Add accomplishment
            </button>
          ) : (
            <>
              <div className="space-y-1.5">
                {profile.additionalInfo.map((text, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-slate-200 flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge color="blue">Additional</Badge>
                      <span className="text-sm text-slate-700">{text}</span>
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
        </div>
      </Card>

      <div className="flex justify-end mt-5">
        <Btn onClick={() => navigate(`/jobs/${posting.id}/generate`)}>
          <FileText size={14} />
          Generate
        </Btn>
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
