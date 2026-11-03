// What this file is: the resume section. It lists the stored files and lets the user add several, remove one, or read one into the profile.
// In plain terms: the part of the options page where you manage your resume files.
import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { browser } from 'wxt/browser';
import { llmErrorMessage } from '../../../src/lib/llm';
import { Btn } from '../../../src/components/ui/primitives';
import { deleteResume, getResume, listResumes, saveResume } from '../lib/data';
import { extractFromResume, mapExtracted, NoReadableTextError } from '../lib/resumeImport';
import type { ExtensionProfile, ResumeFileRef } from '../types/profile';
import { SettingsSection } from './SettingsSection';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const MAX_RESUMES = 10;

/** The most recently saved resume. */
function newest(resumes: ResumeFileRef[]): ResumeFileRef | undefined {
  return resumes.reduce<ResumeFileRef | undefined>((a, r) => (!a || r.updatedAt >= a.updatedAt ? r : a), undefined);
}

type FillState = 'idle' | 'consent' | 'working' | 'done' | 'error';

/**
 * Firefox asks for optional data-collection consent. This must run inside the click handler.
 * It returns true when the user agreed. Chrome has no such permission.
 * In plain terms: the browser's own "may this add-on send your data" question (Firefox only).
 */
function askDataPermission(): Promise<boolean> {
  if (!import.meta.env.FIREFOX) return Promise.resolve(true);
  const request = { data_collection: ['personallyIdentifyingInfo'] } as unknown as Parameters<
    typeof browser.permissions.request
  >[0];
  return browser.permissions.request(request).catch(() => false);
}

export function ResumeSection({
  resumes,
  onChange,
  profile,
  onProfile,
}: {
  resumes: ResumeFileRef[];
  onChange: (resumes: ResumeFileRef[]) => void;
  profile: ExtensionProfile;
  onProfile: (profile: ExtensionProfile) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  // The resume to read into the profile. Empty means the newest.
  const [chosen, setChosen] = useState('');
  const [fill, setFill] = useState<{ state: FillState; message: string }>({ state: 'idle', message: '' });
  // The latest profile, so edits made while the AI works are not lost.
  const latest = useRef(profile);
  latest.current = profile;

  // Runs after Continue. Nothing is sent before this point, and nothing is saved by it.
  // In plain terms: reads the resume and puts the result in the form for the user to check.
  function runFill() {
    const readId = chosen && resumes.some((r) => r.id === chosen) ? chosen : (newest(resumes)?.id ?? '');
    const allowed = askDataPermission();
    setFill({ state: 'working', message: 'Reading your resume…' });
    void (async () => {
      try {
        if (!(await allowed)) {
          setFill({ state: 'error', message: 'Permission was not given. Nothing was sent.' });
          return;
        }
        const file = await getResume(readId);
        if (!file) throw new Error('No resume is stored.');
        const result = mapExtracted(await extractFromResume(file), latest.current);
        onProfile(result.profile);
        setFill({
          state: 'done',
          message: result.filled
            ? `Filled ${result.filled} ${result.filled === 1 ? 'field' : 'fields'}. Check them, then Save.`
            : 'Nothing to fill. The empty fields have no match in your resume.',
        });
      } catch (e) {
        setFill({
          state: 'error',
          message: e instanceof NoReadableTextError ? e.message : llmErrorMessage(e, 'Reading that resume'),
        });
      }
    })();
  }

  // Saves each chosen file in turn. A failed file does not stop the others.
  async function pick(files: File[]) {
    if (files.length === 0) return;
    setError('');
    const errors: string[] = [];
    for (const file of files) {
      try {
        await saveResume(file);
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : 'Could not save the file.'}`);
      }
    }
    if (input.current) input.current.value = '';
    try {
      onChange(await listResumes());
    } catch {
      errors.push('Could not read the list of resumes.');
    }
    setError(errors.join(' '));
  }

  async function remove(id: string) {
    setError('');
    try {
      await deleteResume(id);
      onChange(resumes.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the file.');
    }
  }

  return (
    <SettingsSection
      title="Resume"
      hint="PDF or DOCX, up to 15 MB each, up to 10 files. They stay in this browser until you attach one to a form."
    >
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx"
        aria-label="Resume file"
        multiple
        className="hidden"
        onChange={(e) => void pick(Array.from(e.target.files ?? []))}
      />
      {resumes.length > 0 ? (
        <ul className="space-y-3">
          {resumes.map((resume) => (
            <li key={resume.id} className="flex items-center gap-3">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-slate-500 dark:text-slate-400" />
              <div data-testid="resume-details" className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={resume.fileName}>
                  {resume.fileName}
                </p>
                <p className="truncate text-sm text-slate-600 dark:text-slate-400">
                  {formatSize(resume.sizeBytes)} · saved {new Date(resume.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Btn variant="secondary" size="sm" onClick={() => void remove(resume.id)}>
                Remove
              </Btn>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">No resume yet.</p>
      )}
      <div className={resumes.length > 0 ? 'mt-3' : 'mt-2'}>
        <Btn variant="secondary" size="sm" disabled={resumes.length >= MAX_RESUMES} onClick={() => input.current?.click()}>
          Add
        </Btn>
      </div>
      {resumes.length > 0 && (
        <div className="mt-4">
          {resumes.length > 1 && (
            <label className="mb-3 block text-sm text-slate-700 dark:text-slate-300">
              Resume to read
              <select
                value={chosen || newest(resumes)?.id}
                onChange={(e) => setChosen(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fileName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {fill.state === 'consent' ? (
            <div role="group" aria-label="Send resume text">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Your resume&apos;s text is sent through the Dovetailed proxy to the AI provider that reads it.
              </p>
              <div className="mt-3 flex gap-2">
                <Btn size="sm" onClick={runFill}>
                  Continue
                </Btn>
                <Btn variant="secondary" size="sm" onClick={() => setFill({ state: 'idle', message: '' })}>
                  Cancel
                </Btn>
              </div>
            </div>
          ) : (
            <Btn
              variant="secondary"
              size="sm"
              disabled={fill.state === 'working'}
              onClick={() => setFill({ state: 'consent', message: '' })}
            >
              Fill profile from resume
            </Btn>
          )}
          {fill.message && (
            <p
              role={fill.state === 'error' ? 'alert' : 'status'}
              className={`mt-2 text-sm ${fill.state === 'error' ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}
            >
              {fill.message}
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
