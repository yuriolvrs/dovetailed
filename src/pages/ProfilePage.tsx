// What this file is: the Profile route's page component. Loads the profile
// from Dexie on mount, composes all the section forms plus BackupControls,
// and autosaves edits (on every change, except the two large free-text
// fields which save on blur).
// In plain terms: the whole "Profile" screen you see when you go to the
// Profile tab.

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Profile } from '../types';
import { computeProfileCompleteness, loadProfile, saveProfile } from '../lib/profileStore';
import { loadTemplate } from '../lib/templateStore';
import { ContactForm } from '../components/profile/ContactForm';
import { SkillsForm } from '../components/profile/SkillsForm';
import { ExperienceForm } from '../components/profile/ExperienceForm';
import { ProjectsForm } from '../components/profile/ProjectsForm';
import { EducationForm } from '../components/profile/EducationForm';
import { WritingSamplesForm } from '../components/profile/WritingSamplesForm';
import { TexTemplateSection } from '../components/profile/TexTemplateSection';
import { ImportResumeSection } from '../components/profile/ImportResumeSection';
import { JobDocumentImportSection } from '../components/profile/JobDocumentImportSection';
import { BackupControls } from '../components/profile/BackupControls';
import { BulletRewriteSuggest } from '../components/resume/BulletRewriteSuggest';
import { useAutosaveIndicator } from '../lib/useAutosaveIndicator';
import { Btn, PageSkeleton, SavedIndicator } from '../components/ui/primitives';

// Shared by Experience and Projects tabs -- see ResumeEditor.tsx's identical
// wiring, which is where this action originated (opt-in, per-bullet, never
// automatic).
// In plain terms: the "Suggest rewording" button shown under each bullet.
function bulletRewrite(bulletText: string, applySuggestion: (next: string) => void) {
  return <BulletRewriteSuggest bulletText={bulletText} onApply={applySuggestion} />;
}

// The Profile page's tabs, in order. `checks` names the completeness labels
// (from computeProfileCompleteness) that belong to a tab, so its badge can
// flag the ones still missing -- the same information the page's old sidebar
// showed, now surfaced per tab instead. Import and backup/restore share one
// tab ("Import & Data") since they're one-time setup/maintenance actions,
// not profile content the way the others are.
// In plain terms: the list of tabs across the top of the Profile page, and
// what each one needs filled in to not show a warning.
const TABS = [
  { id: 'contact', label: 'Contact', checks: ['Name', 'Email'] },
  { id: 'education', label: 'Education', checks: ['Education'] },
  { id: 'experience', label: 'Experience', checks: ['Work Experience'] },
  { id: 'projects', label: 'Projects', checks: ['Projects'] },
  { id: 'skills', label: 'Skills', checks: ['Skills'] },
  { id: 'writing-samples', label: 'Writing Samples', checks: [] },
  { id: 'tex-template', label: '.tex Template', checks: [] },
  { id: 'import-data', label: 'Import & Data', checks: [] },
] as const satisfies readonly { id: string; label: string; checks: readonly string[] }[];

type TabId = (typeof TABS)[number]['id'];

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('contact');
  // Only needed for the tab badge's "still empty" flag -- the .tex section
  // owns its own copy of the template; null means we haven't looked yet.
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null);
  const { saved, pulse } = useAutosaveIndicator();

  const refreshTemplate = useCallback(() => {
    // Raw .tex alone doesn't count -- only a converted, saved placeholder
    // template is usable for export.
    loadTemplate().then((t) => setHasTemplate(Boolean(t?.compiledTemplate.trim())));
  }, []);

  const refresh = useCallback(() => {
    loadProfile().then(setProfile);
    refreshTemplate();
  }, [refreshTemplate]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Left/right arrow keys step between tabs, matching native browser-tab
  // keyboard behavior -- ignored while focus is in a text field so typing
  // isn't hijacked.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const idx = TABS.findIndex((t) => t.id === activeTab);
      const next = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;
      if (next >= 0 && next < TABS.length) setActiveTab(TABS[next].id);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

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

  // For writing samples: update on-screen state on every keystroke, but only
  // persist to Dexie on blur, to avoid a write per character typed.
  function updateLive(patch: Partial<Profile>) {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  if (!profile) {
    return <PageSkeleton cards={4} />;
  }

  const completeness = computeProfileCompleteness(profile);
  // Tabs that don't count toward the completeness meter but are still worth
  // flagging when empty -- amber, versus red for the required checks above.
  // In plain terms: optional things you haven't filled in yet.
  const optionalEmpty: Record<string, boolean> = {
    'writing-samples': profile.writingSamples.every((s) => s.trim() === ''),
    'tex-template': hasTemplate === false,
  };

  const activeIndex = TABS.findIndex((t) => t.id === activeTab);

  return (
    <div className="pb-16">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Profile</h1>
        <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5">
          Enter your details once — this is the source data every generated resume and cover
          letter draws from.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            Complete
          </span>
          <SavedIndicator visible={saved} />
        </div>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{completeness.percent}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-slate-900 dark:bg-slate-100 transition-[width] duration-300 ease-out"
          style={{ width: `${completeness.percent}%` }}
        />
      </div>

      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex items-end gap-0.5 mt-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab, i) => {
          const active = tab.id === activeTab;
          const required = tab.checks.filter((c) => completeness.missing.includes(c));
          const flag =
            required.length > 0
              ? ({ color: 'red', title: `Required: ${required.join(', ')}` } as const)
              : optionalEmpty[tab.id]
                ? ({ color: 'amber', title: 'Empty — optional, but recommended' } as const)
                : null;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex flex-1 items-center justify-center gap-2 px-2 py-2.5 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-colors',
                active
                  ? 'bg-white text-slate-900 shadow-[0_-1px_3px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:text-slate-100'
                  : 'bg-[#e6e9ed] text-slate-500 hover:bg-[#edf0f3] dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {active ? (
                <span className="w-4 h-4 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center text-[9px] font-bold shrink-0">
                  {i + 1}
                </span>
              ) : flag ? (
                <AlertCircle
                  className={`w-3.5 h-3.5 shrink-0 ${flag.color === 'red' ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}`}
                  role="img"
                >
                  <title>{flag.title}</title>
                </AlertCircle>
              ) : (
                <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
              )}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="[&>*:first-child]:rounded-t-none [&>*:first-child]:border-t-0">
        {activeTab === 'contact' && (
          <ContactForm value={profile.contact} onChange={(contact) => update({ contact })} />
        )}
        {activeTab === 'education' && (
          <EducationForm value={profile.education} onChange={(education) => update({ education })} />
        )}
        {activeTab === 'experience' && (
          <ExperienceForm
            value={profile.experience}
            onChange={(experience) => update({ experience })}
            bulletRewrite={bulletRewrite}
          />
        )}
        {activeTab === 'projects' && (
          <ProjectsForm
            value={profile.projects}
            onChange={(projects) => update({ projects })}
            bulletRewrite={bulletRewrite}
          />
        )}
        {activeTab === 'skills' && (
          <SkillsForm value={profile.skills} onChange={(skills) => update({ skills })} />
        )}
        {activeTab === 'writing-samples' && (
          <WritingSamplesForm
            value={profile.writingSamples}
            onChange={(writingSamples) => updateLive({ writingSamples })}
            onCommit={(writingSamples) => update({ writingSamples })}
          />
        )}
        {activeTab === 'tex-template' && <TexTemplateSection onChanged={refreshTemplate} />}
        {activeTab === 'import-data' && (
          <>
            <ImportResumeSection
              profile={profile}
              onImported={(next) => {
                setProfile(next);
                void saveProfile(next);
              }}
            />
            <div className="mt-4">
              <JobDocumentImportSection
                profile={profile}
                onImported={(next) => {
                  setProfile(next);
                  void saveProfile(next);
                }}
              />
            </div>
            <div className="mt-4">
              <BackupControls onDataChanged={refresh} />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        {activeIndex > 0 ? (
          <Btn size="md" variant="secondary" onClick={() => setActiveTab(TABS[activeIndex - 1].id)}>
            <ChevronLeft size={13} />
            {TABS[activeIndex - 1].label}
          </Btn>
        ) : (
          <div />
        )}
        {activeIndex < TABS.length - 1 ? (
          <Btn size="md" onClick={() => setActiveTab(TABS[activeIndex + 1].id)}>
            {TABS[activeIndex + 1].label}
            <ChevronRight size={13} />
          </Btn>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
