// What this file is: the "add a job/project from a document" entry point on
// the Profile page. Attaching an old job description, offer letter, role
// summary, or project brief generates one new Experience or Project entry
// with ATS-ready bullets -- unlike ImportResumeSection's verbatim
// transcription, the bullets here are reworded, so the review screen flags
// any generated bullet that isn't backed by the document (see
// verifyGeneratedEntry.ts) and nothing is written to the profile until the
// user applies it.
// In plain terms: attach a document about a job or project you had, review
// the resume-ready entry it makes from it, then add it to your profile.

import { useState } from 'react';
import { AlertTriangle, Briefcase, Check, FolderGit2, X } from 'lucide-react';
import type { ExperienceEntry, Profile, ProjectEntry } from '../../types';
import { extractText, generateStructured, llmErrorMessage } from '../../lib/llm';
import {
  buildGenerateEntryFromDocumentPrompt,
  isGeneratedEntry,
  type ExtractedGeneratedExperience,
  type ExtractedGeneratedProject,
  type GeneratedEntry,
} from '../../prompts/generateEntryFromDocument';
import { unverifiedBullets, type UnverifiedBullet } from '../../lib/files/verifyGeneratedEntry';
import { FileDropzone } from '../ui/FileDropzone';
import { Badge, Btn, Card, SectionTitle } from '../ui/primitives';

// Same trade-off as ImportResumeSection: reasoning tokens come out of the
// same budget as the JSON answer, and this task (a handful of fields plus a
// few bullets) needs little deliberation.
const GENERATE_MAX_TOKENS = 3000;
const GENERATE_REASONING_EFFORT = 'low' as const;

interface Review {
  documentText: string;
  entry: GeneratedEntry;
  unverified: UnverifiedBullet[];
}

function toExperienceEntry(entry: GeneratedEntry): ExperienceEntry {
  const e: ExtractedGeneratedExperience = entry.experience ?? {};
  return {
    section: 'Work Experience',
    company: e.company ?? '',
    title: e.title ?? '',
    startMonth: e.startMonth,
    startYear: e.startYear,
    endMonth: e.endMonth,
    endYear: e.endYear,
    current: e.current ?? false,
    location: e.location,
    bullets: entry.bullets,
  };
}

function toProjectEntry(entry: GeneratedEntry): ProjectEntry {
  const p: ExtractedGeneratedProject = entry.project ?? {};
  return { name: p.name ?? '', description: p.description ?? '', bullets: entry.bullets, links: [] };
}

export function JobDocumentImportSection({
  profile,
  onImported,
}: {
  profile: Profile;
  onImported: (next: Profile) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [kind, setKind] = useState<'experience' | 'project'>('experience');

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setImported(false);
    setStatus('Reading the document…');
    try {
      const documentText = await extractText(file);
      setStatus('Writing an entry from it…');
      const entry = await generateStructured(buildGenerateEntryFromDocumentPrompt(documentText), isGeneratedEntry, {
        maxTokens: GENERATE_MAX_TOKENS,
        reasoningEffort: GENERATE_REASONING_EFFORT,
        temperature: 0.3,
      });
      setReview({ documentText, entry, unverified: unverifiedBullets(entry.bullets, documentText) });
      setKind(entry.kind);
    } catch (err) {
      setError(llmErrorMessage(err, 'Reading that document'));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  function applyImport() {
    if (!review) return;
    const next: Profile =
      kind === 'experience'
        ? { ...profile, experience: [...profile.experience, toExperienceEntry(review.entry)] }
        : { ...profile, projects: [...profile.projects, toProjectEntry(review.entry)] };
    onImported(next);
    setReview(null);
    setImported(true);
  }

  const e = review?.entry.experience;
  const p = review?.entry.project;

  return (
    <Card className="p-6">
      <SectionTitle sub="Attach an old job description, offer letter, or project brief to add it as a new entry — you review it before it's applied">
        Add a Job or Project from a Document
      </SectionTitle>

      {!review && (
        <>
          <FileDropzone
            onFile={handleFile}
            busy={busy}
            busyLabel={status ?? 'Reading…'}
            label="Attach a job or project document"
          />
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          {imported && (
            <p className="text-xs text-emerald-600 mt-2 inline-flex items-center gap-1">
              <Check size={12} />
              Added to your profile.
            </p>
          )}
        </>
      )}

      {review && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-slate-500">Choose what this is, review the bullets, then add it.</p>
            <button
              type="button"
              onClick={() => setReview(null)}
              aria-label="Discard"
              className="shrink-0 text-slate-300 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('experience')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                kind === 'experience'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Briefcase size={14} />
              Work Experience
            </button>
            <button
              type="button"
              onClick={() => setKind('project')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                kind === 'project'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <FolderGit2 size={14} />
              Project
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            {kind === 'experience' ? (
              <p className="text-sm font-medium text-slate-800">
                {e?.title || 'Untitled role'}
                {e?.company && <span className="text-slate-400"> · {e.company}</span>}
                {(e?.startYear || e?.endYear) && (
                  <span className="text-slate-400">
                    {' '}
                    · {e?.startYear ?? '?'}–{e?.current ? 'Present' : (e?.endYear ?? '?')}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm font-medium text-slate-800">{p?.name || 'Untitled project'}</p>
            )}

            <ul className="mt-3 space-y-1.5">
              {review.entry.bullets.map((bullet, i) => {
                const flagged = review.unverified.find((u) => u.index === i);
                return (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                    <span className="mt-1 h-1 w-1 rounded-full bg-slate-300 shrink-0" />
                    <span>
                      {bullet}
                      {flagged && (
                        <Badge color="amber">
                          <AlertTriangle size={10} />
                          check "{flagged.terms[0]}"
                        </Badge>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {review.unverified.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs text-amber-800 font-medium inline-flex items-center gap-1.5">
                <AlertTriangle size={13} />
                {review.unverified.length} bullet{review.unverified.length === 1 ? '' : 's'} mention something not
                found in the document
              </p>
              <p className="text-[11px] text-amber-700 mt-1">
                These may have been rephrased past what the document actually says. Check them before adding, or
                edit them after.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Btn variant="secondary" onClick={() => setReview(null)}>
              Discard
            </Btn>
            <Btn onClick={applyImport}>
              <Check size={14} />
              Add to my profile
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
