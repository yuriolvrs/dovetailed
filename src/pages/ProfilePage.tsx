// What this file is: the Profile route's page component. Loads the profile
// from Dexie on mount, composes all the section forms plus BackupControls,
// and autosaves edits (on every change, except the two large free-text
// fields which save on blur). An empty profile opens on ProfileStart instead
// of the tabs, and a "Ready to tailor" checklist sits above the tabs.
// In plain terms: the whole "Profile" screen you see when you go to the
// Profile tab.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Check, CheckCircle, ChevronLeft, ChevronRight, CircleDashed } from 'lucide-react';
import type { Profile } from '../types';
import { computeProfileCompleteness, hasBullets, loadProfile, saveProfile } from '../lib/profileStore';
import { loadTemplate } from '../lib/templateStore';
import { ContactForm } from '../components/profile/ContactForm';
import { SkillsForm } from '../components/profile/SkillsForm';
import { ExperienceForm } from '../components/profile/ExperienceForm';
import { ProjectsEditor } from '../components/profile/ProjectsEditor';
import { EducationForm } from '../components/profile/EducationForm';
import { WritingSamplesForm } from '../components/profile/WritingSamplesForm';
import { TexTemplateSection } from '../components/profile/TexTemplateSection';
import { ImportResumeSection } from '../components/profile/ImportResumeSection';
import { JobDocumentImportSection } from '../components/profile/JobDocumentImportSection';
import { BackupControls } from '../components/profile/BackupControls';
import { ProfileStart } from '../components/profile/ProfileStart';
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
// showed, now surfaced per tab instead. Experience and Projects share the
// Highlights check, since bullets in either one satisfy it. Import and
// backup/restore share one
// tab ("Import & Data") since they're one-time setup/maintenance actions,
// not profile content the way the others are.
// In plain terms: the list of tabs across the top of the Profile page, and
// what each one needs filled in to not show a warning.
const TABS = [
  { id: 'contact', label: 'Contact', checks: ['Name', 'Email'] },
  { id: 'education', label: 'Education', checks: [] },
  { id: 'experience', label: 'Experience', checks: ['Highlights'] },
  { id: 'projects', label: 'Projects', checks: ['Highlights'] },
  { id: 'skills', label: 'Skills', checks: ['Skills'] },
  { id: 'writing-samples', label: 'Writing Samples', checks: [] },
  { id: 'tex-template', label: '.tex Template', checks: [] },
  { id: 'import-data', label: 'Import & Data', checks: [] },
] as const satisfies readonly { id: string; label: string; checks: readonly string[] }[];

type TabId = (typeof TABS)[number]['id'];

// How each readiness check reads in the "To tailor to a job, add ..." line.
const MISSING_LABELS: Record<string, string> = {
  Name: 'your name',
  Email: 'your email',
  Skills: 'a skill',
  Highlights: 'a bullet on a job or project',
};

// True when nothing at all has been entered yet, which is when the start
// screen shows instead of the tabs.
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

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('contact');
  // Set when the user leaves the start screen without importing anything.
  const [skipStart, setSkipStart] = useState(false);
  const navigate = useNavigate();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
  // Arrow keys move between tabs only while a tab itself has focus (the ARIA
  // tabs pattern). Bound to the window, they also fired inside the entry
  // rail, where Left/Right silently navigated the user out of the section
  // they were editing.
  function handleTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    let next = idx;
    if (e.key === 'ArrowLeft') next = idx - 1;
    else if (e.key === 'ArrowRight') next = idx + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    if (next < 0 || next >= TABS.length) return;
    e.preventDefault();
    setActiveTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

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

  if (!skipStart && isBlankProfile(profile)) {
    return (
      <ProfileStart
        profile={profile}
        onImported={(next) => {
          setProfile(next);
          void saveProfile(next);
          setActiveTab('experience');
        }}
        onStartBlank={() => setSkipStart(true)}
        onRestore={() => {
          setSkipStart(true);
          setActiveTab('import-data');
        }}
      />
    );
  }

  const completeness = computeProfileCompleteness(profile);
  // Tabs that don't count toward the completeness meter but are still worth
  // flagging when empty -- amber, versus red for the required checks above.
  // In plain terms: optional things you haven't filled in yet.
  const optionalEmpty: Record<string, boolean> = {
    education: profile.education.length === 0,
    experience: profile.experience.length === 0,
    projects: profile.projects.length === 0,
    'writing-samples': profile.writingSamples.every((s) => s.trim() === ''),
    'tex-template': hasTemplate === false,
  };
  // Entries that exist but have no bullets. Matching never reads a title or
  // company, so these are flagged red even when another entry has bullets.
  // In plain terms: jobs or projects you added but haven't written any
  // highlights for yet.
  const withoutBullets: Record<string, number> = {
    experience: profile.experience.filter((e) => !hasBullets(e)).length,
    projects: profile.projects.filter((e) => !hasBullets(e)).length,
  };

  const activeIndex = TABS.findIndex((t) => t.id === activeTab);

  return (
    <div className="pb-16">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Profile</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Enter your details. This is the source data every generated resume and cover
          letter draws from.
        </p>
      </div>

      {/* Ready to tailor: what is still needed, each one a link to its tab. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        {completeness.missing.length === 0 ? (
          <>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
              <CheckCircle size={15} />
              Ready to tailor
              <SavedIndicator visible={saved} />
            </p>
            <Btn size="sm" onClick={() => navigate('/')}>
              Tailor to a job
              <ArrowRight size={13} />
            </Btn>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>To tailor to a job, add</span>
              {completeness.missing.map((label, i) => {
                const tab = TABS.find((t) => (t.checks as readonly string[]).includes(label));
                return (
                  <span key={label}>
                    <button
                      type="button"
                      onClick={() => tab && setActiveTab(tab.id)}
                      className="font-medium text-slate-900 dark:text-slate-100 underline hover:text-slate-600 dark:hover:text-slate-300"
                    >
                      {MISSING_LABELS[label] ?? label}
                    </button>
                    {i < completeness.missing.length - 1 ? ',' : '.'}
                  </span>
                );
              })}
            </p>
            <SavedIndicator visible={saved} />
          </>
        )}
      </div>

      <div
        role="tablist"
        aria-label="Profile sections"
        className="flex items-end gap-0.5 mt-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((tab, i) => {
          const active = tab.id === activeTab;
          const required = tab.checks.filter((c) => completeness.missing.includes(c));
          const bulletless = withoutBullets[tab.id] ?? 0;
          const flag =
            required.length > 0
              ? ({
                  color: 'red',
                  state: `missing ${required.join(', ')}`,
                  Icon: AlertCircle,
                } as const)
              : bulletless > 0
                ? ({ color: 'red', state: `${bulletless} without highlights`, Icon: AlertCircle } as const)
                : optionalEmpty[tab.id]
                  ? ({ color: 'amber', state: 'empty, optional', Icon: CircleDashed } as const)
                  : null;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`profile-tab-${tab.id}`}
              aria-selected={active}
              aria-label={
                flag ? `${tab.label} — ${flag.state}` : tab.id === 'import-data' ? tab.label : `${tab.label} — complete`
              }
              aria-controls="profile-tabpanel"
              // One tab stop for the whole strip: Tab reaches the selected
              // tab, arrows move within it.
              tabIndex={active ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              onKeyDown={handleTabKeyDown}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex flex-1 items-center justify-center gap-2 px-2 py-2.5 rounded-t-xl text-xs font-semibold whitespace-nowrap transition-colors',
                active
                  ? 'bg-white text-slate-900 shadow-[0_-1px_3px_rgba(15,23,42,0.04)] dark:bg-slate-900 dark:text-slate-100'
                  : 'bg-[#e6e9ed] text-slate-600 hover:bg-[#edf0f3] hover:text-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {active ? (
                <span className="w-4 h-4 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center text-[9px] font-bold shrink-0">
                  {i + 1}
                </span>
              ) : flag ? (
                // Shape differs as well as colour: a red and an amber copy of
                // the same icon is a colour-only distinction.
                <flag.Icon
                  aria-hidden
                  className={`w-3.5 h-3.5 shrink-0 ${flag.color === 'red' ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}`}
                />
              ) : tab.id === 'import-data' ? null : (
                // Import & Data has nothing to complete, so it gets no tick.
                <span
                  aria-hidden
                  className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 flex items-center justify-center shrink-0"
                >
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
              )}
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="profile-tabpanel" aria-labelledby={`profile-tab-${activeTab}`} className="[&>*:first-child]:rounded-t-none [&>*:first-child]:border-t-0">
        {activeTab === 'contact' && (
          <ContactForm value={profile.contact} onChange={(contact) => update({ contact })} />
        )}
        {activeTab === 'education' && (
          <EducationForm value={profile.education} onChange={(education) => update({ education })} saved={saved} />
        )}
        {activeTab === 'experience' && (
          <ExperienceForm
            value={profile.experience}
            onChange={(experience) => update({ experience })}
            bulletRewrite={bulletRewrite}
            saved={saved}
          />
        )}
        {activeTab === 'projects' && (
          <ProjectsEditor
            value={profile.projects}
            onChange={(projects) => update({ projects })}
            bulletRewrite={bulletRewrite}
            saved={saved}
          />
        )}
        {(activeTab === 'experience' || activeTab === 'projects') && (
          // Keyed by tab so switching tabs resets it to that tab's kind.
          <div className="mt-4">
            <JobDocumentImportSection
              key={activeTab}
              profile={profile}
              initialKind={activeTab === 'experience' ? 'experience' : 'project'}
              onImported={(next) => {
                setProfile(next);
                void saveProfile(next);
              }}
            />
          </div>
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
          <Btn size="md" variant="secondary" onClick={() => setActiveTab(TABS[activeIndex + 1].id)}>
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
