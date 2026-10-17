// What this file is: the "import from an existing resume" entry point on the
// Profile page, plus the review screen it opens. Reading and structuring the
// file happens here; nothing is written to the profile until the user picks
// which sections to apply and how to resolve anything that duplicates an
// entry they already have.
// The resume can be attached as a file or pasted as text.
// In plain terms: attach or paste your old resume, see exactly what was read
// out of it, then choose what to keep before it touches your profile.

import { useState } from 'react';
import { AlertTriangle, Check, FileText, X } from 'lucide-react';
import type { Profile } from '../../types';
import { extractText, generateStructured, llmErrorMessage } from '../../lib/llm';
import { buildExtractProfilePrompt, isExtractedProfile } from '../../prompts/extractProfile';
import type { ExtractedProfile } from '../../prompts/extractProfile';
import {
  findDuplicates,
  mergeProfile,
  resolutionKey,
  type DuplicateAction,
  type SectionKey,
} from '../../lib/files/mergeProfile';
import { verifyExtractedProfile, type UnverifiedField } from '../../lib/files/verifyExtraction';
import { FileDropzone } from '../ui/FileDropzone';
import { Badge, Btn, Card, fieldInputClass, fieldLabelClass, SectionTitle } from '../ui/primitives';

// Generous: the extraction returns the whole resume as JSON, and the model
// spends reasoning tokens against the same budget (see PROGRESS.md's
// gpt-oss-120b findings).
const EXTRACT_MAX_TOKENS = 6000;

// Transcribing a document into fields needs almost no deliberation, and any
// reasoning tokens spent come straight out of the budget the JSON answer
// needs -- the same trade-off the LaTeX conversion makes.
const EXTRACT_REASONING_EFFORT = 'low' as const;

const SECTION_LABELS: Record<SectionKey, string> = {
  contact: 'Contact Info',
  education: 'Education',
  experience: 'Work Experience',
  projects: 'Projects',
  skills: 'Skills',
};

interface Review {
  extracted: ExtractedProfile;
  unverified: UnverifiedField[];
}

// Counts what an extraction would contribute per section, so the review can
// say "3 roles" rather than making the user count rows.
function sectionCount(extracted: ExtractedProfile, section: SectionKey): number {
  switch (section) {
    case 'contact':
      return (
        Object.values(extracted.contact ?? {}).filter((v) => typeof v === 'string' && v.trim()).length +
        (extracted.contact?.links ?? []).filter((l) => l.trim()).length +
        (extracted.summary?.trim() ? 1 : 0)
      );
    case 'skills':
      return (extracted.skills ?? []).reduce((n, g) => n + g.items.length, 0);
    case 'experience':
      return (extracted.experience ?? []).length;
    case 'projects':
      return (extracted.projects ?? []).length;
    case 'education':
      return (extracted.education ?? []).length;
  }
}

export function ImportResumeSection({
  profile,
  onImported,
  bare = false,
}: {
  profile: Profile;
  onImported: (next: Profile) => void;
  /** Drops the card and heading, for a page that supplies its own (the profile start screen). */
  bare?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  // What the dropzone says while working. Kept distinct from `imported` so a
  // progress label is never doubling as a completion flag.
  const [status, setStatus] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [selected, setSelected] = useState<Set<SectionKey>>(new Set());
  const [resolutions, setResolutions] = useState<Record<string, DuplicateAction>>({});
  const [pasted, setPasted] = useState('');
  // Several resumes at once: the ones still waiting, and where we are in the
  // batch. Each is reviewed and applied in turn, so duplicates are checked
  // against a profile that already holds the earlier ones.
  const [queue, setQueue] = useState<File[]>([]);
  const [batch, setBatch] = useState<{ index: number; total: number; name: string } | null>(null);

  // Shared by both inputs: gets the resume text, then pulls the profile
  // fields out of it for review.
  // In plain terms: the same "read it, sort it into sections" steps for a
  // file or for pasted text.
  async function readResume(readText: () => Promise<string>, readingLabel: string) {
    setBusy(true);
    setError(null);
    setImported(false);
    setStatus(readingLabel);
    try {
      const documentText = await readText();
      setStatus('Pulling out your details…');
      const extracted = await generateStructured(
        buildExtractProfilePrompt(documentText),
        isExtractedProfile,
        { maxTokens: EXTRACT_MAX_TOKENS, reasoningEffort: EXTRACT_REASONING_EFFORT },
      );
      // Verified against the document's own text, not the model's say-so.
      const unverified = verifyExtractedProfile(extracted, documentText);
      const present = (Object.keys(SECTION_LABELS) as SectionKey[]).filter(
        (s) => sectionCount(extracted, s) > 0,
      );
      setReview({ extracted, unverified });
      setSelected(new Set(present));
      setResolutions({});
    } catch (err) {
      setError(llmErrorMessage(err, 'Reading that resume'));
      // A failed file should not strand the others behind it.
      setBatch(null);
      setQueue([]);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  // Starts reading one file of a batch, labelled with its place in it.
  function readFile(file: File, index: number, total: number) {
    setBatch(total > 1 ? { index, total, name: file.name } : null);
    void readResume(
      () => extractText(file),
      total > 1 ? `Reading ${file.name} (${index + 1} of ${total})…` : 'Reading the document…',
    );
  }

  function handleFiles(files: File[]) {
    setQueue(files.slice(1));
    readFile(files[0], 0, files.length);
  }

  const handlePaste = () => {
    setBatch(null);
    setQueue([]);
    void readResume(async () => pasted.trim(), 'Reading your resume…');
  };

  // After a file is applied or discarded, moves on to the next one waiting.
  function next() {
    setReview(null);
    if (queue.length === 0 || !batch) {
      setBatch(null);
      return;
    }
    const [file, ...rest] = queue;
    setQueue(rest);
    readFile(file, batch.index + 1, batch.total);
  }

  function toggle(section: SectionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  const duplicates = review ? findDuplicates(profile, review.extracted) : [];
  // A duplicate the user has not decided on is combined: their entry is kept
  // and only new bullets are added, which suits the same job appearing on
  // several resumes and never removes anything.
  const resolutionFor = (key: string): DuplicateAction => resolutions[key] ?? 'combine';

  function applyImport() {
    if (!review) return;
    const decided = Object.fromEntries(
      duplicates.map((hit) => {
        const key = resolutionKey(hit.section, hit.extractedIndex);
        return [key, resolutionFor(key)];
      }),
    );
    const merged = mergeProfile(profile, review.extracted, [...selected], decided);
    onImported(merged);
    setPasted('');
    setImported(true);
    next();
  }

  const unverifiedCount = review?.unverified.length ?? 0;

  const body = (
    <>
      {!review && (
        <>
          <FileDropzone
            onFiles={handleFiles}
            busy={busy}
            busyLabel={status ?? 'Reading…'}
            label="Attach your resume, or several to combine them"
          />
          <label className={`mt-4 mb-1.5 block ${fieldLabelClass}`} htmlFor="resume-paste">
            Or paste your resume text
          </label>
          <textarea
            id="resume-paste"
            value={pasted}
            onChange={(ev) => setPasted(ev.target.value)}
            rows={5}
            disabled={busy}
            placeholder="Copy everything from your resume or LinkedIn profile and paste it here."
            className={`w-full ${fieldInputClass}`}
          />
          <div className="mt-2 flex items-center justify-end gap-3">
            {busy && status && <span className="text-xs text-slate-500 dark:text-slate-400">{status}</span>}
            <Btn onClick={handlePaste} disabled={busy || pasted.trim() === ''}>
              Read pasted text
            </Btn>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
          {imported && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 inline-flex items-center gap-1">
              <Check size={12} />
              Imported into your profile.
            </p>
          )}
        </>
      )}

      {review && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
              <FileText size={13} className="text-slate-500 dark:text-slate-400" />
              {batch
                ? `${batch.name} (${batch.index + 1} of ${batch.total}): choose what to add. Nothing is changed until you apply.`
                : 'Choose what to add. Nothing is changed until you apply.'}
            </p>
            <button
              type="button"
              onClick={next}
              aria-label="Discard import"
              className="shrink-0 text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {unverifiedCount > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-400 font-medium inline-flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {unverifiedCount} item{unverifiedCount === 1 ? '' : 's'} could not be found in the
                document
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-500 mt-1">
                These may have been rephrased or invented rather than copied. Check them after
                importing.
              </p>
              <ul className="mt-2 space-y-1">
                {review.unverified.slice(0, 6).map((field) => (
                  <li key={field.path} className="text-[11px] text-amber-900 dark:text-amber-300">
                    <span className="font-mono text-amber-700 dark:text-amber-500">{field.path}</span> — “{field.text}”
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            {(Object.keys(SECTION_LABELS) as SectionKey[]).map((section) => {
              const count = sectionCount(review.extracted, section);
              if (count === 0) return null;
              const sectionDupes = duplicates.filter((d) => d.section === section);

              return (
                <div key={section} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(section)}
                      onChange={() => toggle(section)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {SECTION_LABELS[section]}
                    </span>
                    <Badge color="slate">
                      {count} item{count === 1 ? '' : 's'}
                    </Badge>
                    {sectionDupes.length > 0 && (
                      <Badge color="amber">
                        {sectionDupes.length} already in your profile
                      </Badge>
                    )}
                  </label>

                  {selected.has(section) &&
                    sectionDupes.map((hit) => {
                      const key = resolutionKey(hit.section, hit.extractedIndex);
                      const action = resolutionFor(key);
                      return (
                        <div key={key} className="mt-2 ml-7 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Duplicate of an entry you already have:
                          </span>
                          {(['combine', 'replace', 'skip', 'append'] as DuplicateAction[]).map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setResolutions((prev) => ({ ...prev, [key]: option }))}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                                action === option
                                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
                              }`}
                            >
                              {option === 'combine'
                                ? 'Combine'
                                : option === 'append'
                                  ? 'Add anyway'
                                  : option === 'replace'
                                    ? 'Replace mine'
                                    : 'Skip'}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={next}>
              {queue.length > 0 ? 'Skip this file' : 'Discard'}
            </Btn>
            <Btn onClick={applyImport} disabled={selected.size === 0}>
              <Check size={14} />
              {queue.length > 0 ? 'Add and read the next file' : 'Add to my profile'}
            </Btn>
          </div>
        </div>
      )}
    </>
  );

  if (bare) return body;
  return (
    <Card className="p-6">
      <SectionTitle sub="Attach or paste an existing resume to fill this page in. You review everything before it's applied">
        Import from a Resume
      </SectionTitle>
      {body}
    </Card>
  );
}
