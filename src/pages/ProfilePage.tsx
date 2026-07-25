// What this file is: the Profile route's page component. Loads the profile
// from Dexie on mount, composes all the section forms plus BackupControls,
// and autosaves edits (on every change, except the two large free-text
// fields which save on blur).
// In plain terms: the whole "Profile" screen you see when you go to the
// Profile tab.

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../types';
import { loadProfile, saveProfile } from '../lib/profileStore';
import { ContactForm } from '../components/profile/ContactForm';
import { SkillsForm } from '../components/profile/SkillsForm';
import { ExperienceForm } from '../components/profile/ExperienceForm';
import { ProjectsForm } from '../components/profile/ProjectsForm';
import { EducationForm } from '../components/profile/EducationForm';
import { WritingSamplesForm } from '../components/profile/WritingSamplesForm';
import { BackupControls } from '../components/profile/BackupControls';
import { Card, FieldTextarea, SectionTitle } from '../components/ui/primitives';

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);

  const refresh = useCallback(() => {
    loadProfile().then(setProfile);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Merges a partial change into state and persists immediately.
  function update(patch: Partial<Profile>) {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      void saveProfile(next);
      return next;
    });
  }

  // For summary/writing samples: update on-screen state on every keystroke,
  // but only persist to Dexie on blur, to avoid a write per character typed.
  function updateLive(patch: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  if (!profile) {
    return <p className="text-sm text-slate-400">Loading…</p>;
  }

  return (
    <div className="space-y-4 pb-16">
      <div className="mb-3">
        <h1 className="text-lg font-semibold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Enter your details once — this is the source data every generated resume and cover
          letter draws from.
        </p>
      </div>

      <ContactForm value={profile.contact} onChange={(contact) => update({ contact })} />

      <Card className="p-6">
        <SectionTitle sub="2–4 sentences that open your resume">Summary</SectionTitle>
        <FieldTextarea
          value={profile.summary}
          onChange={(summary) => updateLive({ summary })}
          onBlur={() => update({ summary: profile.summary })}
          placeholder="A short professional summary..."
          rows={3}
        />
      </Card>

      <SkillsForm value={profile.skills} onChange={(skills) => update({ skills })} />
      <ExperienceForm value={profile.experience} onChange={(experience) => update({ experience })} />
      <ProjectsForm value={profile.projects} onChange={(projects) => update({ projects })} />
      <EducationForm value={profile.education} onChange={(education) => update({ education })} />
      <WritingSamplesForm
        value={profile.writingSamples}
        onChange={(writingSamples) => updateLive({ writingSamples })}
        onCommit={(writingSamples) => update({ writingSamples })}
      />

      <BackupControls onDataChanged={refresh} />
    </div>
  );
}
