// What this file is: the resume section. It shows the stored file details and lets the user upload, replace or delete it.
// In plain terms: the part of the options page where you manage your resume file.
import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Btn } from '../../../src/components/ui/primitives';
import { deleteResume, saveResume } from '../lib/data';
import type { ResumeFileRef } from '../types/profile';
import { SettingsSection } from './SettingsSection';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ResumeSection({
  resume,
  onChange,
}: {
  resume: ResumeFileRef | undefined;
  onChange: (resume: ResumeFileRef | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

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
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
