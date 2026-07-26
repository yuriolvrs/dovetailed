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

// Left-rail jump-to links for the sections below -- plain in-page anchors,
// each section carries a matching id + scroll-mt so the sticky header
// doesn't cover it when jumped to.
// In plain terms: the list of section names on the left that scroll you to
// that part of the page when clicked.
const SECTIONS = [
  { id: 'contact', label: 'Contact Info' },
  { id: 'summary', label: 'Summary' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Work Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'education', label: 'Education' },
  { id: 'writing-samples', label: 'Writing Samples' },
  { id: 'data', label: 'Data' },
] as const;

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
    <div className="pb-16">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900">Profile</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Enter your details once — this is the source data every generated resume and cover
          letter draws from.
        </p>
      </div>

      <div className="flex gap-6 items-start">
        <aside className="hidden lg:flex flex-col gap-1 w-44 shrink-0 sticky top-20">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {section.label}
            </a>
          ))}
          <hr className="my-2 border-slate-200" />
          <span
            title="Coming in a future phase"
            className="px-3 py-1.5 rounded-lg text-sm text-slate-300 cursor-not-allowed"
          >
            Resume Template
          </span>
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          <div id="contact" className="scroll-mt-20">
            <ContactForm value={profile.contact} onChange={(contact) => update({ contact })} />
          </div>

          <div id="summary" className="scroll-mt-20">
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
          </div>

          <div id="skills" className="scroll-mt-20">
            <SkillsForm value={profile.skills} onChange={(skills) => update({ skills })} />
          </div>
          <div id="experience" className="scroll-mt-20">
            <ExperienceForm value={profile.experience} onChange={(experience) => update({ experience })} />
          </div>
          <div id="projects" className="scroll-mt-20">
            <ProjectsForm value={profile.projects} onChange={(projects) => update({ projects })} />
          </div>
          <div id="education" className="scroll-mt-20">
            <EducationForm value={profile.education} onChange={(education) => update({ education })} />
          </div>
          <div id="writing-samples" className="scroll-mt-20">
            <WritingSamplesForm
              value={profile.writingSamples}
              onChange={(writingSamples) => updateLive({ writingSamples })}
              onCommit={(writingSamples) => update({ writingSamples })}
            />
          </div>

          <div id="data" className="scroll-mt-20">
            <BackupControls onDataChanged={refresh} />
          </div>
        </div>
      </div>
    </div>
  );
}
