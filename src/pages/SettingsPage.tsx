// What this file is: the Settings route. Holds what shapes your documents but
// is not work history: writing samples, the LaTeX template, and backup,
// restore and delete-all. These were tabs on the Profile page before.
// In plain terms: the page for writing samples, the resume template, and
// backing up your data.

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../types';
import { loadProfile, saveProfile } from '../lib/profileStore';
import { WritingSamplesForm } from '../components/profile/WritingSamplesForm';
import { TexTemplateSection } from '../components/profile/TexTemplateSection';
import { BackupControls, DeleteAllControls } from '../components/profile/BackupControls';
import { PageSkeleton } from '../components/ui/primitives';

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const refresh = useCallback(() => {
    loadProfile().then(setProfile);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!profile) return <PageSkeleton cards={3} />;

  return (
    <div className="space-y-4 pb-16">
      <div className="mb-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Things that shape your documents but are not part of your work history.
        </p>
      </div>

      <WritingSamplesForm
        value={profile.writingSamples}
        // Typing updates the screen only; the sample saves when the field
        // loses focus, to avoid a write per keystroke.
        onChange={(writingSamples) => setProfile({ ...profile, writingSamples })}
        onCommit={(writingSamples) => {
          const next = { ...profile, writingSamples };
          setProfile(next);
          void saveProfile(next);
        }}
      />
      <TexTemplateSection />
      <BackupControls onDataChanged={refresh} />
      <DeleteAllControls onDataChanged={refresh} />
    </div>
  );
}
