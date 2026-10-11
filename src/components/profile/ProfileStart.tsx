// What this file is: the first screen of an empty profile. It offers three
// starts: read an existing resume (file or pasted text), start from scratch,
// or restore a backup. The resume path reuses ImportResumeSection, so its
// review step and duplicate handling are the same as on the Import tab.
// In plain terms: instead of eight empty tabs, a new user first sees "give us
// your resume, or start blank".

import type { Profile } from '../../types';
import { ImportResumeSection } from './ImportResumeSection';
import { Btn, Card, SectionTitle } from '../ui/primitives';

export function ProfileStart({
  profile,
  onImported,
  onStartBlank,
  onRestore,
}: {
  profile: Profile;
  onImported: (next: Profile) => void;
  onStartBlank: () => void;
  /** Opens the tab with backup restore. */
  onRestore: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto pb-16 space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Set up your profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Every resume and cover letter is built only from your profile. The fastest start is a resume you already
          have. You check everything before it is added.
        </p>
      </div>

      <Card className="p-6">
        <SectionTitle sub="Attach a file, or paste the text from a resume or LinkedIn profile">
          Start from your resume
        </SectionTitle>
        <ImportResumeSection bare profile={profile} onImported={onImported} />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Btn variant="secondary" onClick={onStartBlank}>
          No resume? Start from scratch
        </Btn>
        <button
          type="button"
          onClick={onRestore}
          className="text-xs text-slate-500 dark:text-slate-400 underline hover:text-slate-900 dark:hover:text-slate-100"
        >
          Restore a Dovetailed backup
        </button>
      </div>
    </div>
  );
}
