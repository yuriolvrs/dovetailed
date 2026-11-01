// What this file is: the options page. It loads the profile, lets the user edit it and the resume, and saves through the data layer.
// In plain terms: the settings screen where you enter your details and resume.
import { useEffect, useState } from 'react';
import { Btn, SavedIndicator } from '../../../src/components/ui/primitives';
import { BrandHeader } from '../../src/components/BrandHeader';
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
    <main className="mx-auto max-w-4xl px-6 pt-10 text-slate-900 dark:text-slate-100 sm:px-10">
      <div className="pb-8">
        <BrandHeader />
      </div>
      {!profile ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'Loading...'}</p>
      ) : (
        <>
          <ResumeSection resume={profile.resume} onChange={setResume} />
          <ProfileEditor value={profile} onChange={setProfile} />
          <div className="sticky bottom-0 z-10 -mx-6 flex items-center gap-3 border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950 sm:-mx-10 sm:px-10">
            <Btn onClick={() => void save()}>Save</Btn>
            <SavedIndicator visible={saved} />
            {error && (
              <span role="alert" className="text-sm text-red-700 dark:text-red-400">
                {error}
              </span>
            )}
          </div>
        </>
      )}
    </main>
  );
}
