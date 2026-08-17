// What this file is: the "import from an existing resume" entry point on the
// Profile page, plus the review screen it opens. Reading and structuring the
// file happens here; nothing is written to the profile until the user picks
// which sections to apply and how to resolve anything that duplicates an
// entry they already have.
// In plain terms: attach your old resume, see exactly what was read out of
// it, then choose what to keep before it touches your profile.

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
import { Badge, Btn, Card, SectionTitle } from '../ui/primitives';

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
      return Object.values(extracted.contact ?? {}).filter((v) => typeof v === 'string' && v.trim()).length;
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
}: {
  profile: Profile;
  onImported: (next: Profile) => void;
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

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setImported(false);
    setStatus('Reading the document…');
    try {
      const documentText = await extractText(file);
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
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function toggle(section: SectionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function applyImport() {
    if (!review) return;
    const next = mergeProfile(profile, review.extracted, [...selected], resolutions);
    onImported(next);
    setReview(null);
    setImported(true);
  }

  const duplicates = review ? findDuplicates(profile, review.extracted) : [];
  const unverifiedCount = review?.unverified.length ?? 0;

  return (
    <Card className="p-6">
      <SectionTitle sub="Attach an existing resume to fill this page in — you review everything before it's applied">
        Import from a Resume
      </SectionTitle>

      {!review && (
        <>
          <FileDropzone
            onFile={handleFile}
            busy={busy}
            busyLabel={status ?? 'Reading…'}
            label="Attach your existing resume"
          />
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          {imported && (
            <p className="text-xs text-emerald-600 mt-2 inline-flex items-center gap-1">
              <Check size={12} />
              Imported into your profile.
            </p>
          )}
        </>
      )}

      {review && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
              <FileText size={13} className="text-slate-400" />
              Choose what to add. Nothing is changed until you apply.
            </p>
            <button
              type="button"
              onClick={() => setReview(null)}
              aria-label="Discard import"
              className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {unverifiedCount > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800 font-medium inline-flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {unverifiedCount} item{unverifiedCount === 1 ? '' : 's'} could not be found in the
                document
              </p>
              <p className="text-[11px] text-amber-700 mt-1">
                These may have been rephrased or invented rather than copied. Check them after
                importing.
              </p>
              <ul className="mt-2 space-y-1">
                {review.unverified.slice(0, 6).map((field) => (
                  <li key={field.path} className="text-[11px] text-amber-900">
                    <span className="font-mono text-amber-700">{field.path}</span> — “{field.text}”
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
                <div key={section} className="rounded-xl border border-slate-200 p-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(section)}
                      onChange={() => toggle(section)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm font-medium text-slate-800">
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
                      const action = resolutions[key] ?? 'append';
                      return (
                        <div key={key} className="mt-2 ml-7 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-slate-500">
                            Duplicate of an entry you already have:
                          </span>
                          {(['append', 'replace', 'skip'] as DuplicateAction[]).map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setResolutions((prev) => ({ ...prev, [key]: option }))}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                                action === option
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {option === 'append'
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
            <Btn variant="secondary" onClick={() => setReview(null)}>
              Discard
            </Btn>
            <Btn onClick={applyImport} disabled={selected.size === 0}>
              <Check size={14} />
              Add to my profile
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
