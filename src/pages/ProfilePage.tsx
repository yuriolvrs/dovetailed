// What this file is: the Profile route's page component. Loads the profile
// from Dexie on mount, composes all the section forms plus BackupControls,
// and autosaves edits (on every change, except the two large free-text
// fields which save on blur).
// In plain terms: the whole "Profile" screen you see when you go to the
// Profile tab.

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '../types';
import { computeProfileCompleteness, loadProfile, saveProfile } from '../lib/profileStore';
import { ContactForm } from '../components/profile/ContactForm';
import { SkillsForm } from '../components/profile/SkillsForm';
import { ExperienceForm } from '../components/profile/ExperienceForm';
import { ProjectsForm } from '../components/profile/ProjectsForm';
import { EducationForm } from '../components/profile/EducationForm';
import { WritingSamplesForm } from '../components/profile/WritingSamplesForm';
import { TexTemplateSection } from '../components/profile/TexTemplateSection';
import { BackupControls } from '../components/profile/BackupControls';
import { PageSkeleton } from '../components/ui/primitives';

// Left-rail jump-to links for the sections below -- plain in-page anchors,
// each section carries a matching id + scroll-mt so the sticky header
// doesn't cover it when jumped to.
// In plain terms: the list of section names on the left that scroll you to
// that part of the page when clicked.
const SECTIONS = [
  { id: 'contact', label: 'Contact Info' },
  { id: 'education', label: 'Education' },
  { id: 'experience', label: 'Work Experience' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
  { id: 'writing-samples', label: 'Writing Samples' },
  { id: 'tex-template', label: '.tex Template' },
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

  // For writing samples: update on-screen state on every keystroke, but only
  // persist to Dexie on blur, to avoid a write per character typed.
  function updateLive(patch: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  if (!profile) {
    return <PageSkeleton cards={4} />;
  }

  const completeness = computeProfileCompleteness(profile);

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
          <div className="px-3 pb-3 mb-1 border-b border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                Complete
              </span>
              <span className="text-xs font-semibold text-slate-700">{completeness.percent}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-900 transition-[width] duration-300 ease-out"
                style={{ width: `${completeness.percent}%` }}
              />
            </div>
            {completeness.missing.length > 0 && (
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Missing: {completeness.missing.join(', ')}
              </p>
            )}
          </div>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {section.label}
            </a>
          ))}
        </aside>

        <div className="flex-1 min-w-0 space-y-4">
          <div id="contact" className="scroll-mt-20">
            <ContactForm value={profile.contact} onChange={(contact) => update({ contact })} />
          </div>

          <div id="education" className="scroll-mt-20">
            <EducationForm value={profile.education} onChange={(education) => update({ education })} />
          </div>
          <div id="experience" className="scroll-mt-20">
            <ExperienceForm value={profile.experience} onChange={(experience) => update({ experience })} />
          </div>
          <div id="projects" className="scroll-mt-20">
            <ProjectsForm value={profile.projects} onChange={(projects) => update({ projects })} />
          </div>
          <div id="skills" className="scroll-mt-20">
            <SkillsForm value={profile.skills} onChange={(skills) => update({ skills })} />
          </div>
          <div id="writing-samples" className="scroll-mt-20">
            <WritingSamplesForm
              value={profile.writingSamples}
              onChange={(writingSamples) => updateLive({ writingSamples })}
              onCommit={(writingSamples) => update({ writingSamples })}
            />
          </div>

          <div id="tex-template" className="scroll-mt-20">
            <TexTemplateSection />
          </div>

          <div id="data" className="scroll-mt-20">
            <BackupControls onDataChanged={refresh} />
          </div>
        </div>
      </div>
    </div>
  );
}
