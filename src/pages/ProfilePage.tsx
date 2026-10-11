// What this file is: the Profile route's page component. Loads the profile
// from Dexie on mount and autosaves every edit. An empty profile opens on
// ProfileStart (read a resume, or start from scratch); starting from scratch
// runs the guided ProfileSetup. Otherwise the profile is one page that reads
// like a resume, every entry editable in place, with an outline beside it
// showing what is still missing. Writing samples, the .tex template and
// backups live on the Settings page.
// In plain terms: the whole "Profile" screen -- your resume details on one
// page, or a step-by-step setup when you have none yet.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle, CircleDashed, FileText, X } from 'lucide-react';
import type { Profile } from '../types';
import { computeProfileCompleteness, hasBullets, loadProfile, saveProfile } from '../lib/profileStore';
import { ImportResumeSection } from '../components/profile/ImportResumeSection';
import { ProfileStart } from '../components/profile/ProfileStart';
import { ProfileSetup } from '../components/profile/ProfileSetup';
import {
  ContactSection,
  EducationSection,
  ExperienceSection,
  ProjectsSection,
  SkillsSection,
} from '../components/profile/ProfileSections';
import { useAutosaveIndicator } from '../lib/useAutosaveIndicator';
import { Btn, PageSkeleton, SavedIndicator } from '../components/ui/primitives';

// How each readiness check reads in the outline, and the section it lives in.
const MISSING_LABELS: Record<string, { text: string; section: string }> = {
  Name: { text: 'your name', section: 'contact' },
  Email: { text: 'your email', section: 'contact' },
  Skills: { text: 'a skill', section: 'skills' },
  Highlights: { text: 'a bullet on a job or project', section: 'experience' },
};

// True when nothing at all has been entered yet, which is when the start
// screen shows instead of the profile.
// In plain terms: is this a brand-new, untouched profile?
function isBlankProfile(profile: Profile): boolean {
  return (
    profile.contact.name.trim() === '' &&
    profile.contact.email.trim() === '' &&
    profile.experience.length === 0 &&
    profile.projects.length === 0 &&
    profile.education.length === 0 &&
    profile.skills.every((group) => group.items.length === 0)
  );
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * One row of the outline: a jump link to a section, with its count or its
 * problem. Red marks something that blocks tailoring, amber an optional gap.
 * In plain terms: a link in the left-hand list, like "Projects · 1 without
 * bullets".
 */
function OutlineLink({
  href,
  label,
  note,
  tone = 'plain',
}: {
  href: string;
  label: string;
  note: string;
  tone?: 'plain' | 'problem' | 'optional';
}) {
  return (
    <a
      href={href}
      className="flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
    >
      {label}
      <span
        className={`flex items-center gap-1 text-xs font-normal ${
          tone === 'problem'
            ? 'text-red-600 dark:text-red-400'
            : tone === 'optional'
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {tone === 'problem' && <AlertCircle size={12} aria-hidden />}
        {tone === 'optional' && <CircleDashed size={12} aria-hidden />}
        {note}
      </span>
    </a>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  // 'start' and 'setup' only ever show for a blank profile; 'sheet' is the
  // one-page profile.
  const [mode, setMode] = useState<'start' | 'setup' | 'sheet'>('start');
  const [importing, setImporting] = useState(false);
  const navigate = useNavigate();
  const { saved, pulse } = useAutosaveIndicator();

  const refresh = useCallback(() => {
    loadProfile().then((loaded) => {
      setProfile(loaded);
      setMode(isBlankProfile(loaded) ? 'start' : 'sheet');
    });
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
    pulse();
  }

  // An import or "describe it" result replaces the whole profile.
  function replace(next: Profile) {
    setProfile(next);
    void saveProfile(next);
    pulse();
  }

  if (!profile) {
    return <PageSkeleton cards={4} />;
  }

  if (mode === 'start') {
    return (
      <ProfileStart
        profile={profile}
        onImported={(next) => {
          replace(next);
          setMode('sheet');
        }}
        onStartBlank={() => setMode('setup')}
        onRestore={() => navigate('/settings')}
      />
    );
  }

  const describe = { profile, onImported: replace };

  if (mode === 'setup') {
    return (
      <ProfileSetup
        profile={profile}
        update={update}
        describe={describe}
        saved={saved}
        onReadResume={() => setMode('start')}
        onFinish={() => setMode('sheet')}
      />
    );
  }

  const completeness = computeProfileCompleteness(profile);
  const roleGaps = profile.experience.filter((e) => !hasBullets(e)).length;
  const projectGaps = profile.projects.filter((e) => !hasBullets(e)).length;
  const skillTotal = profile.skills.reduce((sum, group) => sum + group.items.length, 0);
  const contactMissing = completeness.missing.filter((label) => label === 'Name' || label === 'Email');

  return (
    <div className="pb-16">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Profile</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Every resume and cover letter is built only from what is here. Click any entry to edit it.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          {completeness.missing.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle size={15} aria-hidden />
                Ready to tailor
              </p>
              <Btn size="sm" className="mt-2" onClick={() => navigate('/')}>
                Tailor to a job
                <ArrowRight size={13} />
              </Btn>
            </div>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <p>To tailor to a job, add</p>
              <ul className="mt-1 space-y-0.5">
                {completeness.missing.map((label) => (
                  <li key={label}>
                    <a
                      href={`#${MISSING_LABELS[label]?.section ?? 'contact'}`}
                      className="font-medium underline underline-offset-2 hover:text-red-950 dark:hover:text-white"
                    >
                      {MISSING_LABELS[label]?.text ?? label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <nav
            aria-label="Profile sections"
            className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0"
          >
            <OutlineLink
              href="#contact"
              label="You"
              note={contactMissing.length > 0 ? `No ${contactMissing.join(' or ').toLowerCase()}` : 'Done'}
              tone={contactMissing.length > 0 ? 'problem' : 'plain'}
            />
            <OutlineLink
              href="#experience"
              label="Experience"
              note={roleGaps > 0 ? `${roleGaps} without bullets` : plural(profile.experience.length, 'role')}
              tone={roleGaps > 0 ? 'problem' : profile.experience.length === 0 ? 'optional' : 'plain'}
            />
            <OutlineLink
              href="#projects"
              label="Projects"
              note={projectGaps > 0 ? `${projectGaps} without bullets` : plural(profile.projects.length, 'project')}
              tone={projectGaps > 0 ? 'problem' : profile.projects.length === 0 ? 'optional' : 'plain'}
            />
            <OutlineLink
              href="#skills"
              label="Skills"
              note={plural(skillTotal, 'skill')}
              tone={skillTotal === 0 ? 'problem' : 'plain'}
            />
            <OutlineLink
              href="#education"
              label="Education"
              note={plural(profile.education.length, 'school')}
              tone={profile.education.length === 0 ? 'optional' : 'plain'}
            />
          </nav>

          <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <Btn size="sm" variant="secondary" onClick={() => setImporting((open) => !open)}>
              {importing ? <X size={13} /> : <FileText size={13} />}
              {importing ? 'Close' : 'Read a resume file'}
            </Btn>
            <SavedIndicator visible={saved} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {importing && <ImportResumeSection profile={profile} onImported={replace} />}
          <ContactSection value={profile.contact} onChange={(contact) => update({ contact })} />
          <ExperienceSection
            value={profile.experience}
            onChange={(experience) => update({ experience })}
            describe={describe}
          />
          <ProjectsSection
            value={profile.projects}
            onChange={(projects) => update({ projects })}
            describe={describe}
          />
          <SkillsSection value={profile.skills} onChange={(skills) => update({ skills })} />
          <EducationSection value={profile.education} onChange={(education) => update({ education })} />
        </div>
      </div>
    </div>
  );
}
