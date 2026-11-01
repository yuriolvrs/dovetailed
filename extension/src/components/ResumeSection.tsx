// What this file is: the resume card. It shows the stored file details and lets the user upload, replace or delete it.
// In plain terms: the part of the options page where you manage your resume file.
import { useRef, useState } from 'react';
import { Btn, Card, SectionTitle } from '../../../src/components/ui/primitives';
import { deleteResume, saveResume } from '../lib/data';
import type { ResumeFileRef } from '../types/profile';

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
    <Card className="p-6">
      <SectionTitle sub="PDF or DOCX, up to 15 MB. It stays in this browser until you attach it to a form">Resume</SectionTitle>
      {resume ? (
        <p data-testid="resume-details" className="mb-3 text-sm text-slate-700 dark:text-slate-300">
          {resume.fileName} · {formatSize(resume.sizeBytes)} · saved {new Date(resume.updatedAt).toLocaleDateString()}
        </p>
      ) : (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">No resume stored.</p>
      )}
      <input
        ref={input}
        type="file"
        accept=".pdf,.docx"
        aria-label="Resume file"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <div className="flex gap-2">
        <Btn variant="secondary" size="sm" onClick={() => input.current?.click()}>
          {resume ? 'Replace' : 'Upload'}
        </Btn>
        {resume && (
          <Btn variant="secondary" size="sm" onClick={() => void remove()}>
            Delete
          </Btn>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}
