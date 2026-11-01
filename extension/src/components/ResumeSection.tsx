// What this file is: the resume section. It shows the stored file details and lets the user upload, replace or delete it.
// In plain terms: the part of the options page where you manage your resume file.
import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { browser } from 'wxt/browser';
import { llmErrorMessage } from '../../../src/lib/llm';
import { Btn } from '../../../src/components/ui/primitives';
import { deleteResume, getResume, saveResume } from '../lib/data';
import { extractFromResume, mapExtracted, NoReadableTextError } from '../lib/resumeImport';
import type { ExtensionProfile, ResumeFileRef } from '../types/profile';
import { SettingsSection } from './SettingsSection';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
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
  resume,
  onChange,
  profile,
  onProfile,
}: {
  resume: ResumeFileRef | undefined;
  onChange: (resume: ResumeFileRef | undefined) => void;
  profile: ExtensionProfile;
  onProfile: (profile: ExtensionProfile) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [fill, setFill] = useState<{ state: FillState; message: string }>({ state: 'idle', message: '' });
  // The latest profile, so edits made while the AI works are not lost.
  const latest = useRef(profile);
  latest.current = profile;

  // Runs after Continue. Nothing is sent before this point, and nothing is saved by it.
  // In plain terms: reads the resume and puts the result in the form for the user to check.
  function runFill() {
    const allowed = askDataPermission();
    setFill({ state: 'working', message: 'Reading your resume…' });
    void (async () => {
      try {
        if (!(await allowed)) {
          setFill({ state: 'error', message: 'Permission was not given. Nothing was sent.' });
          return;
        }
        const file = await getResume();
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

  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      onChange(await saveResume(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the file.');
    }
    if (input.current) input.current.value = '';
  }

  async function remove() {
    setError('');
    try {
      await deleteResume();
      onChange(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the file.');
    }
  }

  return (
    <SettingsSection
      title="Resume"
      hint="PDF or DOCX, up to 15 MB. It stays in this browser until you attach it to a form."
    >
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx"
        aria-label="Resume file"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {resume ? (
        <div className="flex items-center gap-3">
          <FileText size={20} aria-hidden="true" className="shrink-0 text-slate-500 dark:text-slate-400" />
          <div data-testid="resume-details" className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={resume.fileName}>
              {resume.fileName}
            </p>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">
              {formatSize(resume.sizeBytes)} · saved {new Date(resume.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Btn variant="secondary" size="sm" onClick={() => input.current?.click()}>
              Replace
            </Btn>
            <Btn variant="secondary" size="sm" onClick={() => void remove()}>
              Delete
            </Btn>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">No resume yet.</p>
          <Btn variant="secondary" size="sm" onClick={() => input.current?.click()}>
            Upload
          </Btn>
        </div>
      )}
      {resume && (
        <div className="mt-4">
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
