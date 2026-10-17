// What this file is: the editor for a tailored resume. At the top,
// JobFitPanel says whether the resume fits one page and which of the job's
// requirements it covers, with one-click adds for the ones it could. Below,
// the job-tailored sections first (experience, projects, skills), then
// education and contact. Jobs and projects show every
// bullet ready to edit (ResumeEntryBlock): reorder, reword with AI, take off,
// or add back a left-out profile line, with the lines the job asks for
// marked. Profile entries the resume leaves out are offered at the end of
// their section. Bullets start as verbatim copies of the profile (see
// selectResumeContent.ts); the only AI calls here are opt-in and start on a
// click: "Reword" (or "Suggested wording for this job" on the top few
// bullets) for one bullet, and "Suggest a summary for this job".
// In plain terms: the screen where you shape a tailored resume -- what's on
// it, in what order, in what words -- with the job's wishes marked.

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import type {
  ExperienceEntry,
  HolisticSelection,
  JobAnalysis,
  Profile,
  ProfileAtom,
  ProjectEntry,
  ResumeContent,
} from '../../types';
import {
  educationKey,
  experienceKey,
  projectKey,
  type ResumeFocusTarget,
  type ResumeNavTarget,
} from '../../lib/resumeEntryKeys';
import { buildProfileAtoms, experienceLabel, projectLabel } from '../../lib/profileAtoms';
import { buildJobFit, normalizeLine, resumeLines, type FitReason } from '../../lib/jobFit';
import { DEFAULT_SECTION, addEntryToSection, groupBySection, sectionOrder, setEntrySection } from '../../lib/experienceSections';
import { Btn, ResetButton, formatMonthYear } from '../ui/primitives';
import { ContactSection, EducationSection, SheetSection } from '../profile/ProfileSections';
import { JobFitPanel } from './JobFitPanel';
import { ResumeEntryBlock } from './ResumeEntryBlock';
import { ExperienceFields, ProjectFields } from './ResumeEntryFields';
import { ResumeSkills } from './ResumeSkills';
import { SuggestSummary } from './SuggestSummary';
import { topRequirementLines, topResumeBullets } from '../../lib/topEvidence';

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * "Nov 2024 – Present" for a dated entry, as on the printed resume.
 * In plain terms: the dates on the right of a job.
 */
function dateRange(entry: ExperienceEntry): string {
  const start = formatMonthYear(entry.startMonth, entry.startYear);
  const end = entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear);
  if (!start || !end) return start || end;
  return `${start} – ${end}`;
}

/**
 * The bullets to start a re-added entry with: the ones that fit the job, or
 * its first three when none do -- the same cap the resume build uses.
 * In plain terms: which lines come along when you put a job back.
 */
function startingBullets(bullets: string[], reasonFor: (text: string) => FitReason | null): string[] {
  const real = bullets.filter((b) => b.trim() !== '');
  const fitting = real.filter((b) => reasonFor(b));
  return fitting.length > 0 ? fitting : real.slice(0, 3);
}

/**
 * The end of a section: profile entries this resume leaves out, each one
 * click to add back, with how many of its lines fit the job.
 * In plain terms: the jobs or projects you can put back on this resume.
 */
function LeftOutEntries<T>({
  entries,
  label,
  fitCount,
  onAdd,
}: {
  entries: T[];
  label: (entry: T) => string;
  fitCount: (entry: T) => number;
  onAdd: (entry: T) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <h3 className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-300">Also in your profile</h3>
      <ul>
        {entries.map((entry, i) => {
          const fits = fitCount(entry);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onAdd(entry)}
                className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-900/[0.04] hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 dark:text-slate-300 dark:hover:bg-white/[0.04] dark:hover:text-slate-100"
              >
                <Plus size={14} aria-hidden className="shrink-0 text-slate-500 group-hover:text-slate-900 dark:text-slate-400 dark:group-hover:text-slate-100" />
                <span className="sr-only">Add to resume: </span>
                <span className="min-w-0 flex-1 truncate">{label(entry)}</span>
                {fits > 0 && (
                  <span className="shrink-0 text-xs text-emerald-700 dark:text-emerald-400">
                    {count(fits, 'line')} {fits === 1 ? 'fits' : 'fit'} this job
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The short "Took X off · Undo" line after an entry is removed.
 * In plain terms: a way back if you removed the wrong job.
 */
function RemovedNotice({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <div role="status" className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
      <span className="min-w-0 flex-1 truncate">Took “{name}” off this resume.</span>
      <Btn size="sm" variant="ghost" onClick={onUndo}>
        <RotateCcw size={12} />
        Undo
      </Btn>
    </div>
  );
}

type Removed =
  | { section: 'experience'; entry: ExperienceEntry; index: number }
  | { section: 'projects'; entry: ProjectEntry; index: number };

type OpenDetails = { section: 'experience' | 'projects'; index: number; isNew: boolean } | null;

export function ResumeEditor({
  value,
  analysis,
  holistic,
  profile,
  tailored,
  fitsOnePage,
  onChange,
  onFocusBullet,
  navRequest,
}: {
  value: ResumeContent;
  /** Matched route: requirements and matches, for "fits" marks and coverage. */
  analysis?: JobAnalysis;
  /** Direct route: the AI's picks, for "fits" marks. */
  holistic?: HolisticSelection;
  /** The full profile: the source of left-out lines and entries. */
  profile: Profile;
  /** The resume as built for this job, before edits. Each Reset goes back to it. */
  tailored: ResumeContent;
  /** Null until measured. */
  fitsOnePage: boolean | null;
  onChange: (content: ResumeContent) => void;
  /** The bullet being edited, or null, so the preview can highlight it. */
  onFocusBullet: (target: ResumeFocusTarget | null) => void;
  /** A field clicked in the live preview, to scroll to and focus here. */
  navRequest?: { target: ResumeNavTarget; nonce: number } | null;
}) {
  const atoms = useMemo(() => buildProfileAtoms(profile), [profile]);
  const fit = useMemo(() => buildJobFit(atoms, value, { analysis, holistic }), [atoms, value, analysis, holistic]);
  const postingTerms = analysis?.keywords ?? [];
  // Evidence for a summary suggestion: the profile's own summary, then the
  // lines matched to the job's top requirements.
  const summaryLines = useMemo(
    () => (analysis ? [profile.summary?.trim() ?? '', ...topRequirementLines(analysis, atoms)].filter(Boolean) : []),
    [analysis, atoms, profile.summary],
  );
  // The few bullets that answer the job's heaviest requirements; each gets a
  // quiet "Suggested wording" prompt.
  const suggestedBullets = useMemo(
    () => (analysis && analysis.keywords.length > 0 ? topResumeBullets(analysis, atoms, value) : new Set<string>()),
    [analysis, atoms, value],
  );
  const isSuggestedBullet = (text: string) => suggestedBullets.has(normalizeLine(text));
  const [openDetails, setOpenDetails] = useState<OpenDetails>(null);
  const [removed, setRemoved] = useState<Removed | null>(null);

  const profileExperience = useMemo(
    () => new Map(profile.experience.map((e) => [experienceKey(e), e])),
    [profile.experience],
  );
  const profileProjects = useMemo(() => new Map(profile.projects.map((p) => [projectKey(p), p])), [profile.projects]);
  const leftOutExperience = profile.experience.filter(
    (e) => !value.experience.some((v) => experienceKey(v) === experienceKey(e)),
  );
  const leftOutProjects = profile.projects.filter((p) => !value.projects.some((v) => projectKey(v) === projectKey(p)));

  // The removed-entry notice clears itself after a while.
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 8000);
    return () => clearTimeout(timer);
  }, [removed]);

  // A preview click: scroll to the entry and focus the bullet, or flash the
  // entry. Contact and education open through their own sections' props.
  const target = navRequest?.target;
  const nonce = navRequest?.nonce ?? 0;
  useEffect(() => {
    if (!target || (target.section !== 'experience' && target.section !== 'project' && target.section !== 'skills')) return;
    const timer = setTimeout(() => {
      if (target.section === 'skills') {
        document.getElementById('skills')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-resume-entry="${target.section}:${CSS.escape(target.entryKey)}"]`);
      if (!el) return;
      if (target.bulletIndex !== undefined) {
        const field = el.querySelectorAll<HTMLTextAreaElement>('textarea[data-quick-entry]')[target.bulletIndex];
        field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        field?.focus({ preventScroll: true });
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('ring-2', 'ring-blue-400/50', 'ring-offset-4', 'ring-offset-white', 'dark:ring-offset-slate-900');
      setTimeout(
        () => el.classList.remove('ring-2', 'ring-blue-400/50', 'ring-offset-4', 'ring-offset-white', 'dark:ring-offset-slate-900'),
        1400,
      );
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);
  const navTo = (index: number) => (index >= 0 ? { index, nonce } : null);
  const educationNav =
    target?.section === 'education' ? navTo(value.education.findIndex((e) => educationKey(e) === target.entryKey)) : null;

  function setExperience(experience: ExperienceEntry[]) {
    onChange({ ...value, experience });
  }
  function setProjects(projects: ProjectEntry[]) {
    onChange({ ...value, projects });
  }

  // Swaps two entries of one list, keeping an open details form on its entry.
  function swap<T>(list: T[], a: number, b: number, section: 'experience' | 'projects', commit: (next: T[]) => void) {
    const next = list.slice();
    [next[a], next[b]] = [next[b], next[a]];
    commit(next);
    if (openDetails?.section === section && openDetails.index === a) setOpenDetails({ ...openDetails, index: b });
    else if (openDetails?.section === section && openDetails.index === b) setOpenDetails({ ...openDetails, index: a });
  }

  function toggleDetails(section: 'experience' | 'projects', index: number) {
    setOpenDetails(openDetails?.section === section && openDetails.index === index ? null : { section, index, isNew: false });
  }

  // Puts one profile line on the resume: a skill into its category, a bullet
  // into its entry (adding the entry, with just that bullet, if it is off).
  function addAtom(atom: ProfileAtom) {
    if (atom.source === 'skills') {
      const group = profile.skills.find((g) => g.items.includes(atom.text));
      if (!group) return;
      const exists = value.skills.some((g) => g.category === group.category);
      onChange({
        ...value,
        skills: exists
          ? value.skills.map((g) => (g.category === group.category ? { ...g, items: [...g.items, atom.text] } : g))
          : [...value.skills, { category: group.category, items: [atom.text] }],
      });
      return;
    }
    if (atom.source === 'experience') {
      const source = profile.experience.find((e) => experienceLabel(e) === atom.sourceLabel);
      if (!source) return;
      const at = value.experience.findIndex((e) => experienceKey(e) === experienceKey(source));
      setExperience(
        at >= 0
          ? value.experience.map((e, i) => (i === at ? { ...e, bullets: [...e.bullets, atom.text] } : e))
          : [...value.experience, { ...source, bullets: [atom.text] }],
      );
      return;
    }
    if (atom.source === 'projects') {
      const source = profile.projects.find((p) => projectLabel(p) === atom.sourceLabel);
      if (!source) return;
      const at = value.projects.findIndex((p) => projectKey(p) === projectKey(source));
      setProjects(
        at >= 0
          ? value.projects.map((p, i) => (i === at ? { ...p, bullets: [...p.bullets, atom.text] } : p))
          : [...value.projects, { ...source, bullets: [atom.text] }],
      );
    }
  }

  const fitCount = (bullets: string[]) => bullets.filter((b) => b.trim() && fit.reasonFor(b)).length;
  const picked = holistic ? atoms.filter((a) => holistic.atomIds.includes(a.id)) : [];
  const onPage = resumeLines(value);

  const groups = groupBySection(value.experience);
  const sections = value.experience.length === 0 ? [DEFAULT_SECTION] : sectionOrder(value.experience);
  const experienceBullets = value.experience.reduce((n, e) => n + e.bullets.filter((b) => b.trim()).length, 0);
  const projectBullets = value.projects.reduce((n, p) => n + p.bullets.filter((b) => b.trim()).length, 0);

  function renderExperience(entry: ExperienceEntry, index: number, prev?: number, next?: number): ReactNode {
    const key = experienceKey(entry);
    const open = openDetails?.section === 'experience' && openDetails.index === index;
    return (
      <ResumeEntryBlock
        key={index}
        navKey={`experience:${key}`}
        title={entry.title}
        untitled="Untitled role"
        subtitle={[entry.company, entry.location].filter((p) => p?.trim()).join(' · ')}
        aside={dateRange(entry)}
        detailsOpen={open}
        onToggleDetails={() => toggleDetails('experience', index)}
        details={
          <ExperienceFields
            entry={entry}
            autoFocus={open && openDetails?.isNew}
            onChange={(e) => setExperience(value.experience.map((x, i) => (i === index ? e : x)))}
            sections={sections}
            onSectionChange={(label) => {
              const moved = setEntrySection(value.experience, index, label);
              setExperience(moved.entries);
              setOpenDetails({ section: 'experience', index: moved.index, isNew: false });
            }}
          />
        }
        bullets={entry.bullets}
        onBulletsChange={(bullets) => setExperience(value.experience.map((x, i) => (i === index ? { ...x, bullets } : x)))}
        profileBullets={profileExperience.get(key)?.bullets ?? []}
        reasonFor={fit.reasonFor}
        postingTerms={postingTerms}
        isSuggested={isSuggestedBullet}
        onMoveUp={prev === undefined ? undefined : () => swap(value.experience, index, prev, 'experience', setExperience)}
        onMoveDown={next === undefined ? undefined : () => swap(value.experience, index, next, 'experience', setExperience)}
        onRemove={() => {
          setRemoved({ section: 'experience', entry, index });
          setExperience(value.experience.filter((_, i) => i !== index));
          setOpenDetails(null);
        }}
        onBulletFocus={(bulletIndex) => onFocusBullet({ section: 'experience', entryKey: key, bulletIndex })}
        onBulletBlur={() => onFocusBullet(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <JobFitPanel
        coverage={fit.coverage}
        pickedCount={picked.length}
        pickedOnResume={picked.filter((a) => onPage.has(normalizeLine(a.text))).length}
        fitsOnePage={fitsOnePage}
        onAdd={addAtom}
      />

      <SheetSection
        id="experience"
        title="Experience"
        meta={value.experience.length > 0 ? `${count(value.experience.length, 'role')} · ${count(experienceBullets, 'bullet')}` : undefined}
        actions={
          <>
            <ResetButton onReset={() => setExperience(tailored.experience)} />
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                const last = groups.length > 0 ? groups[groups.length - 1].label : DEFAULT_SECTION;
                const added = addEntryToSection(value.experience, last, () => ({
                  section: DEFAULT_SECTION,
                  company: '',
                  title: '',
                  current: false,
                  bullets: [],
                }));
                setExperience(added.entries);
                setOpenDetails({ section: 'experience', index: added.index, isNew: true });
              }}
            >
              <Plus size={13} />
              New role
            </Btn>
          </>
        }
      >
        {groups.map((group) => (
          <div key={group.label}>
            {groups.length > 1 && (
              <h3 className="mt-2 border-b border-slate-200 pb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-600 dark:border-slate-800 dark:text-slate-300">
                {group.label}
              </h3>
            )}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {group.items.map(({ entry, index }, position) =>
                renderExperience(entry, index, group.items[position - 1]?.index, group.items[position + 1]?.index),
              )}
            </div>
          </div>
        ))}
        {removed?.section === 'experience' && (
          <RemovedNotice
            name={removed.entry.title || 'Untitled role'}
            onUndo={() => {
              const next = value.experience.slice();
              next.splice(Math.min(removed.index, next.length), 0, removed.entry);
              setExperience(next);
              setRemoved(null);
            }}
          />
        )}
        <LeftOutEntries
          entries={leftOutExperience}
          label={(e) => [e.title || 'Untitled role', e.company].filter(Boolean).join(' · ')}
          fitCount={(e) => fitCount(e.bullets)}
          onAdd={(e) => setExperience([...value.experience, { ...e, bullets: startingBullets(e.bullets, fit.reasonFor) }])}
        />
      </SheetSection>

      <SheetSection
        id="projects"
        title="Projects"
        meta={value.projects.length > 0 ? `${count(value.projects.length, 'project')} · ${count(projectBullets, 'bullet')}` : undefined}
        actions={
          <>
            <ResetButton onReset={() => setProjects(tailored.projects)} />
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                setProjects([...value.projects, { name: '', description: '', bullets: [], links: [] }]);
                setOpenDetails({ section: 'projects', index: value.projects.length, isNew: true });
              }}
            >
              <Plus size={13} />
              New project
            </Btn>
          </>
        }
      >
        {value.projects.length === 0 && leftOutProjects.length === 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400">No projects on this resume.</p>
        )}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {value.projects.map((entry, index) => {
            const key = projectKey(entry);
            const open = openDetails?.section === 'projects' && openDetails.index === index;
            return (
              <ResumeEntryBlock
                key={index}
                navKey={`project:${key}`}
                title={entry.name}
                untitled="Untitled project"
                subtitle={entry.description}
                detailsOpen={open}
                onToggleDetails={() => toggleDetails('projects', index)}
                details={
                  <ProjectFields
                    entry={entry}
                    autoFocus={open && openDetails?.isNew}
                    onChange={(p) => setProjects(value.projects.map((x, i) => (i === index ? p : x)))}
                  />
                }
                bullets={entry.bullets}
                onBulletsChange={(bullets) => setProjects(value.projects.map((x, i) => (i === index ? { ...x, bullets } : x)))}
                profileBullets={profileProjects.get(key)?.bullets ?? []}
                reasonFor={fit.reasonFor}
                postingTerms={postingTerms}
                isSuggested={isSuggestedBullet}
                printsWithoutBullets={entry.name.trim() !== ''}
                onMoveUp={index === 0 ? undefined : () => swap(value.projects, index, index - 1, 'projects', setProjects)}
                onMoveDown={
                  index === value.projects.length - 1
                    ? undefined
                    : () => swap(value.projects, index, index + 1, 'projects', setProjects)
                }
                onRemove={() => {
                  setRemoved({ section: 'projects', entry, index });
                  setProjects(value.projects.filter((_, i) => i !== index));
                  setOpenDetails(null);
                }}
                onBulletFocus={(bulletIndex) => onFocusBullet({ section: 'project', entryKey: key, bulletIndex })}
                onBulletBlur={() => onFocusBullet(null)}
              />
            );
          })}
        </div>
        {removed?.section === 'projects' && (
          <RemovedNotice
            name={removed.entry.name || 'Untitled project'}
            onUndo={() => {
              const next = value.projects.slice();
              next.splice(Math.min(removed.index, next.length), 0, removed.entry);
              setProjects(next);
              setRemoved(null);
            }}
          />
        )}
        <LeftOutEntries
          entries={leftOutProjects}
          label={(p) => p.name || 'Untitled project'}
          fitCount={(p) => fitCount(p.bullets)}
          onAdd={(p) => setProjects([...value.projects, { ...p, bullets: startingBullets(p.bullets, fit.reasonFor) }])}
        />
      </SheetSection>

      <ResumeSkills
        value={value.skills}
        profileSkills={profile.skills}
        onChange={(skills) => onChange({ ...value, skills })}
        onReset={() => onChange({ ...value, skills: tailored.skills })}
        reasonFor={fit.reasonFor}
      />

      <EducationSection
        value={value.education}
        onChange={(education) => onChange({ ...value, education })}
        resume={{
          actions: <ResetButton onReset={() => onChange({ ...value, education: tailored.education })} />,
          nav: educationNav,
        }}
      />

      <ContactSection
        value={value.contact}
        onChange={(contact) => onChange({ ...value, contact })}
        summary={value.summary}
        onSummaryChange={(summary) => onChange({ ...value, summary })}
        summaryExtra={
          analysis && (
            <SuggestSummary
              summary={value.summary ?? ''}
              role={analysis.roleSummary}
              lines={summaryLines}
              onApply={(summary) => onChange({ ...value, summary })}
            />
          )
        }
        navNonce={target?.section === 'contact' ? nonce : undefined}
      />
    </div>
  );
}
