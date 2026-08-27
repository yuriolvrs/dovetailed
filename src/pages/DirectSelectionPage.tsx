// What this file is: the direct route's review screen (/jobs/:id/direct) --
// the counterpart to the Matching review screen for the alternate pipeline.
// Where matching shows one row per extracted requirement and the evidence
// confirmed against it, this shows the opposite: the evidence the model chose
// after reading the whole posting at once, grouped by the job/project/skill
// category it came from, each with the model's one-sentence reason. Evidence
// is always a ProfileAtom reference (never free text), exactly as in matching,
// so there is nothing here to hallucinate -- the reasons are the one free-text
// field, and they are display-only, never written into a document or export.
// In plain terms: the screen where you see which parts of your profile the AI
// picked for this job and read why it picked them, before generating.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Info, Sparkles, X } from 'lucide-react';
import type { HolisticRationale, JobPosting, Profile, ProfileAtom } from '../types';
import { loadJobPosting, saveJobPosting } from '../lib/jobStore';
import { loadProfile } from '../lib/profileStore';
import { buildProfileAtoms } from '../lib/profileAtoms';
import { runHolisticSelection } from '../lib/generation/runHolisticSelection';
import { llmErrorMessage } from '../lib/llm';
import { JobDetailHeader } from '../components/jobs/JobDetailHeader';
import { Badge, Btn, Card, EmptyState, PageSkeleton, SectionTitle } from '../components/ui/primitives';

const SOURCE_BADGE_LABEL: Record<ProfileAtom['source'], string> = {
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  additional: 'Additional',
};

// The three parts of the reasoning, in reading order, with the heading each
// gets on screen. The headings carry the structure, so the prose does not have
// to announce what it is about.
const RATIONALE_PARTS: { key: keyof HolisticRationale; label: string }[] = [
  { key: 'asks', label: 'What the posting asks for' },
  { key: 'chose', label: 'What I chose' },
  { key: 'leftOut', label: 'What I left out' },
];

/** One featured group: the atoms chosen from it, plus the model's reason for featuring it. */
interface ChosenGroup {
  sourceLabel: string;
  source: ProfileAtom['source'];
  atoms: ProfileAtom[];
  note?: string;
}

export default function DirectSelectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [posting, setPosting] = useState<JobPosting | null | 'missing'>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmingRerun, setConfirmingRerun] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (!id) return;
    loadJobPosting(id).then((p) => setPosting(p ?? 'missing'));
    loadProfile().then(setProfile);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Abort an in-flight pass if the user navigates away mid-run, so the call
  // isn't left running against a screen nobody is looking at.
  useEffect(() => () => abortRef.current?.abort(), []);

  const selection = posting && posting !== 'missing' ? posting.holisticSelection : undefined;

  // Regroups the chosen atom ids back into the profile entries they came
  // from, in the model's stated order of relevance (a group ranks by its
  // best-placed atom), so the most relevant job/project leads the list.
  const groups: ChosenGroup[] = useMemo(() => {
    if (!selection || !profile) return [];
    const byId = new Map(buildProfileAtoms(profile).map((a) => [a.id, a]));
    const noteFor = new Map(selection.groupNotes.map((n) => [n.sourceLabel, n.note]));
    const order = new Map<string, number>();
    const collected = new Map<string, ChosenGroup>();

    selection.atomIds.forEach((atomId, rank) => {
      const atom = byId.get(atomId);
      // An atom whose text has since been edited no longer hashes to the same
      // id, so a stale selection can point at something that isn't there any
      // more. Skipped rather than rendered as a blank row.
      if (!atom) return;
      const existing = collected.get(atom.sourceLabel);
      if (existing) {
        existing.atoms.push(atom);
        return;
      }
      order.set(atom.sourceLabel, rank);
      collected.set(atom.sourceLabel, {
        sourceLabel: atom.sourceLabel,
        source: atom.source,
        atoms: [atom],
        note: noteFor.get(atom.sourceLabel),
      });
    });

    return [...collected.values()].sort(
      (a, b) => (order.get(a.sourceLabel) ?? 0) - (order.get(b.sourceLabel) ?? 0),
    );
  }, [selection, profile]);

  const chosenCount = groups.reduce((total, group) => total + group.atoms.length, 0);
  const staleCount = selection ? selection.atomIds.length - chosenCount : 0;

  async function handleRun() {
    if (!posting || posting === 'missing' || !profile) return;
    setError(null);
    setStatus('loading');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const atoms = buildProfileAtoms(profile);
      const holisticSelection = await runHolisticSelection(posting, atoms, { signal: controller.signal });
      const next = { ...posting, holisticSelection };
      await saveJobPosting(next);
      setPosting(next);
      setStatus('idle');
      setConfirmingRerun(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle');
        setConfirmingRerun(false);
      } else {
        setError(llmErrorMessage(err, 'Direct selection'));
        setStatus('error');
      }
    } finally {
      abortRef.current = null;
    }
  }

  if (posting === 'missing') {
    return (
      <section>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          That job posting no longer exists.{' '}
          <Link to="/" className="underline hover:text-slate-900 dark:hover:text-slate-100">
            Back to jobs.
          </Link>
        </p>
      </section>
    );
  }

  if (!posting || !profile) return <PageSkeleton cards={2} />;

  const running = status === 'loading';

  return (
    <section className="pb-16">
      <JobDetailHeader
        backHref={`/jobs/${posting.id}`}
        backLabel="Back to posting"
        postingId={posting.id}
        current="choices"
        strategy="holistic"
        analysisDone={Boolean(posting.analysis)}
        matchingDone={Boolean(posting.analysis && posting.analysis.matches.length > 0)}
        selectionDone={Boolean(selection)}
        actions={
          selection && !running ? (
            confirmingRerun ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">Read the posting again?</span>
                <Btn size="sm" variant="dangerSolid" onClick={handleRun}>
                  Re-run
                </Btn>
                <Btn size="sm" variant="secondary" onClick={() => setConfirmingRerun(false)}>
                  Cancel
                </Btn>
              </div>
            ) : (
              <Btn size="sm" variant="secondary" onClick={() => setConfirmingRerun(true)}>
                <Sparkles size={13} />
                Re-run
              </Btn>
            )
          ) : null
        }
      />

      {error && (
        <Card className="p-4 mb-5 border-red-200 dark:border-red-500/30">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </Card>
      )}

      {running && (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Reading the posting and choosing from your profile…
            </p>
            <Btn size="sm" variant="secondary" onClick={() => abortRef.current?.abort()}>
              <X size={13} />
              Cancel
            </Btn>
          </div>
        </Card>
      )}

      {!running && !selection && (
        <Card className="p-8">
          <div className="max-w-lg mx-auto text-center">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Let the AI pick, in one pass
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
              This route skips extracting requirements and matching them one by one. Instead it reads the
              whole posting and your whole profile together, then chooses what to feature and explains why.
              It costs one AI call instead of one per requirement, and it can spot a fit that shares no
              wording with the posting — but it gives you no per-requirement evidence trail to check.
            </p>
            <Btn onClick={handleRun} disabled={!posting.rawText.trim()}>
              <Sparkles size={13} />
              Read posting &amp; choose
            </Btn>
            {!posting.rawText.trim() && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-3">
                Paste the job posting first.{' '}
                <Link to={`/jobs/${posting.id}`} className="underline hover:text-slate-900 dark:hover:text-slate-100">
                  Go to the posting.
                </Link>
              </p>
            )}
          </div>
        </Card>
      )}

      {!running && selection && (
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle sub="The angle the AI took across your whole profile for this posting.">
              Why this selection
            </SectionTitle>
            {/* Three labelled parts across the card's width, rather than one
                column of prose hugging the left edge. Each part comes from its
                own field, so the separation is structural and does not depend
                on the model punctuating its own paragraphs -- told to do that,
                it returned one unbroken block. The heading above each part also
                means none of them has to restate its own purpose in words. */}
            {selection.rationale ? (
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-3">
                {RATIONALE_PARTS.map(({ key, label }) => (
                  <section key={key}>
                    <h3 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                      {label}
                    </h3>
                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                      {selection.rationale![key]}
                    </p>
                  </section>
                ))}
              </div>
            ) : (
              // A selection saved before the reasoning was split into fields.
              // Left as it was written rather than migrated; re-running the
              // pass is what produces the three-part shape.
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed max-w-prose">
                {selection.overallRationale}
              </p>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
              <Info size={13} className="shrink-0 mt-0.5 text-slate-600 dark:text-slate-400" aria-hidden />
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                This explanation is the AI's own words, not evidence. It is shown here for your review only —
                it never appears in your resume, cover letter, or any export. The content of those documents
                is always copied verbatim from your profile.
              </p>
            </div>
          </Card>

          {/* pb-20 clears the sticky action bar below, which would otherwise
              float over the last evidence item until the page is scrolled to
              the very bottom. */}
          <Card className="p-5 pb-14">
            <SectionTitle
              sub={`${chosenCount} item${chosenCount === 1 ? '' : 's'} from ${groups.length} part${
                groups.length === 1 ? '' : 's'
              } of your profile.`}
              right={
                <Badge>
                  {new Date(selection.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Badge>
              }
            >
              Chosen evidence
            </SectionTitle>

            {staleCount > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-4">
                {staleCount} chosen item{staleCount === 1 ? '' : 's'} no longer match your profile — you have
                edited that text since this ran. Re-run to bring the selection up to date.
              </p>
            )}

            {groups.length === 0 ? (
              <EmptyState size="sm">Nothing from your profile was selected for this posting.</EmptyState>
            ) : (
              <ul className="space-y-4">
                {groups.map((group) => (
                  <li
                    key={group.sourceLabel}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-b-0 last:pb-0 pb-4"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {group.sourceLabel}
                      </h3>
                      <Badge>{SOURCE_BADGE_LABEL[group.source]}</Badge>
                    </div>
                    {group.note && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-2.5 italic max-w-prose">
                        {group.note}
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {group.atoms.map((atom) => (
                        <li
                          key={atom.id}
                          className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed pl-3 border-l-2 border-slate-200 dark:border-slate-700"
                        >
                          {atom.text}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="sticky bottom-4">
            <Card className="px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {chosenCount} item{chosenCount === 1 ? '' : 's'} ready to build from
              </p>
              <Btn onClick={() => navigate(`/jobs/${posting.id}/documents?route=direct`)} disabled={chosenCount === 0}>
                Generate
              </Btn>
            </Card>
          </div>
        </div>
      )}
    </section>
  );
}
