// What this file is: the options page. It loads the profile, lets the user edit it and the resume, and saves through the data layer.
// In plain terms: the settings screen where you enter your details and resume.
import { useEffect, useState } from 'react';
import { Btn, SavedIndicator } from '../../../src/components/ui/primitives';
import { ProfileEditor } from '../../src/components/ProfileEditor';
import { ResumeSection } from '../../src/components/ResumeSection';
import { getProfile, saveProfile } from '../../src/lib/data';
import { cleanPhone } from '../../src/lib/phone';
import type { ExtensionProfile, ResumeFileRef } from '../../src/types/profile';

export default function App() {
  const [profile, setProfile] = useState<ExtensionProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getProfile().then(setProfile, () => setError('Could not load your data.'));
  }, []);

  // Cleans the phone, saves, and shows the cleaned values back in the form.
  // In plain terms: the Save button.
  async function save() {
    if (!profile) return;
    setError('');
    const next = { ...profile, phone: cleanPhone(profile.phone) };
    try {
      await saveProfile(next);
      setProfile(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Could not save.');
    }
  }

  // The resume is stored at once; here the form only mirrors the new reference.
  const setResume = (resume: ResumeFileRef | undefined) =>
    setProfile((p) => (p ? { ...p, resume } : p));

  return (
    <main className="mx-auto max-w-2xl space-y-5 bg-[#f5f6f8] p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <h1 className="text-lg font-semibold">Dovetailed Autofill</h1>
      {!profile ? (
        <p className="text-sm text-slate-500">{error || 'Loading...'}</p>
      ) : (
        <>
          <ProfileEditor value={profile} onChange={setProfile} />
          <div className="flex items-center gap-3">
            <Btn onClick={() => void save()}>Save</Btn>
            <SavedIndicator visible={saved} />
            {error && (
              <span role="alert" className="text-xs text-red-600">
                {error}
              </span>
            )}
          </div>
          <ResumeSection resume={profile.resume} onChange={setResume} />
        </>
      )}
    </main>
  );
}
