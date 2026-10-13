// What this file is: the Experience, Projects and Education sections of the
// one-page Profile, each a card of resume-like entries that open for editing
// in place (InlineEntryList). Shared by the one-page profile and the guided
// setup, so a job added during setup is the same thing you edit later.
// Contact and Skills read as resume lines with an Edit button.
// Experience and Projects can also open "Describe it instead", which is the
// existing notes-to-entry flow (JobDocumentImportSection).
// The resume editor uses the same sections on a tailored resume, adding its
// own extras through ResumeExtras (match badges, left-out bullets and
// entries, Reset, opening an entry from a preview click).
// In plain terms: the jobs, projects and schools parts of your profile, and
// of each tailored resume.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, MessageSquareText, Pencil, Plus } from 'lucide-react';
import type { Contact, EducationEntry, ExperienceEntry, Profile, ProjectEntry, SkillGroup } from '../../types';
import { hasBullets } from '../../lib/profileStore';
import { DEFAULT_SECTION, addEntryToSection, groupBySection, sectionOrder, setEntrySection } from '../../lib/experienceSections';
import { BulletRewriteSuggest } from '../resume/BulletRewriteSuggest';
import { Btn, Card, formatMonthYear } from '../ui/primitives';
import { InlineEntryList } from './InlineEntryList';
import { ExperienceDetail } from './ExperienceDetail';
import { ProjectDetail } from './ProjectDetail';
import { EducationDetail } from './EducationDetail';
import { JobDocumentImportSection } from './JobDocumentImportSection';
import { ContactForm } from './ContactForm';
import { SkillsForm } from './SkillsForm';

// The opt-in "Suggest rewording" action under each bullet, same wiring as
// ResumeEditor's.
// In plain terms: the reword button shown under a bullet while you edit it.
function bulletRewrite(bulletText: string, applySuggestion: (next: string) => void) {
  return <BulletRewriteSuggest bulletText={bulletText} onApply={applySuggestion} />;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * The red flag on an entry with no bullets. On the profile it cannot be
 * matched to a job; on a resume it is left out of the printed page.
 * In plain terms: why an entry without bullets is a problem here.
 */
function bulletWarning(entry: { bullets: string[] }, resume?: unknown): string | undefined {
  if (hasBullets(entry)) return undefined;
  return resume ? 'Not printed: no highlights' : 'No highlights yet';
}

/**
 * A dated entry's range as one line, e.g. "Nov 2024 – Present".
 * In plain terms: the "from – to" text on the right of a job or school.
 */
function dateRange(entry: {
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  current: boolean;
}): string {
  const start = formatMonthYear(entry.startMonth, entry.startYear);
  const end = entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear);
  // A missing side shows the other alone, as on the printed resume.
  if (!start || !end) return start || end;
  return `${start} – ${end}`;
}

/** What "Describe it instead" needs: the profile it adds to, and where the result goes. */
export interface DescribeProps {
  profile: Profile;
  onImported: (next: Profile) => void;
}

/**
 * The card around one section: heading, a one-line count, and its actions.
 * In plain terms: the box and title bar of a profile section.
 */
export function SheetSection({
  id,
  title,
  meta,
  actions,
  children,
}: {
  id: string;
  title: string;
  meta?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-4 sm:p-6 scroll-mt-20">
      <section id={id} aria-labelledby={`${id}-title`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-title`} className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {meta && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{meta}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children}
      </section>
    </Card>
  );
}

/**
 * One section's empty state: what belongs here, and the buttons to start.
 * In plain terms: the message shown when a section has nothing in it yet.
 */
function EmptySection({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-5 text-sm text-slate-600 dark:text-slate-400">
      {children}
    </p>
  );
}

/**
 * The "Describe it instead" toggle button and the panel it opens.
 * In plain terms: lets you write about a role or project in your own words
 * and get a drafted entry back.
 */
function useDescribe(kind: 'experience' | 'project', describe?: DescribeProps) {
  const [open, setOpen] = useState(false);
  const button = describe && (
    <Btn size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
      <MessageSquareText size={13} />
      {open ? 'Close' : 'Describe one instead'}
    </Btn>
  );
  // Opens inside the section, above its entries, so it appears where the
  // button was pressed rather than below every entry.
  const panel = describe && open && (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950">
      <JobDocumentImportSection
        inline
        profile={describe.profile}
        initialKind={kind}
        onImported={(next) => {
          describe.onImported(next);
          setOpen(false);
        }}
      />
    </div>
  );
  return { button, panel };
}

/** What the resume editor adds to a section. The Profile page passes none. */
export interface ResumeExtras<T> {
  /** Extra header buttons, e.g. Reset to profile. */
  actions?: ReactNode;
  /** A label beside a bullet, e.g. "Matched to this job". */
  bulletBadge?: (bulletText: string) => ReactNode;
  /** A label beside a closed entry's title, e.g. "2 chosen". */
  entryBadge?: (entry: T) => ReactNode;
  /** Under an open entry's bullets, e.g. bullets this resume left out. */
  belowBullets?: (entry: T, update: (next: T) => void) => ReactNode;
  /** Profile entries this resume left out, offered back. */
  excluded?: { entries: T[]; label: (entry: T) => string; onAdd: (entry: T) => void };
  /** Bullet focus (index) or blur (null), so the preview can highlight it. */
  onFocusBullet?: (entry: T, bulletIndex: number | null) => void;
  /** A preview click asking to open this entry. */
  nav?: { index: number; nonce: number } | null;
}

/**
 * Opens the entry a preview click points at and scrolls it into view.
 * In plain terms: clicking a line in the preview opens it here.
 */
function useNavOpen(sectionId: string, nav: { index: number; nonce: number } | null | undefined, open: (index: number) => void) {
  useEffect(() => {
    if (!nav) return;
    open(nav.index);
    const timer = setTimeout(() => {
      document
        .getElementById(sectionId)
        ?.querySelector(`[data-entry-index="${nav.index}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav?.nonce]);
}

/**
 * The resume editor's "Not included" list: profile entries this resume left
 * out, each one click to add back. Removing an entry from a resume never
 * deletes it from the profile, so it must stay reachable.
 * In plain terms: the jobs or projects you can put back on this resume.
 */
function ExcludedEntries<T>({ excluded }: { excluded?: ResumeExtras<T>['excluded'] }) {
  if (!excluded || excluded.entries.length === 0) return null;
  return (
    <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
      <h3 className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">Not on this resume</h3>
      <ul className="flex flex-col">
        {excluded.entries.map((entry, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => excluded.onAdd(entry)}
              className="-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100"
            >
              <Plus size={13} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{excluded.label(entry)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function newExperienceEntry(): ExperienceEntry {
  return { section: DEFAULT_SECTION, company: '', title: '', current: false, bullets: [] };
}

/**
 * Experience, grouped under its resume headings (e.g. "Work Experience",
 * "Leadership"), each heading its own list of roles.
 * In plain terms: your jobs and positions.
 */
export function ExperienceSection({
  value,
  onChange,
  describe,
  title = 'Experience',
  resume,
}: {
  value: ExperienceEntry[];
  onChange: (next: ExperienceEntry[]) => void;
  describe?: DescribeProps;
  title?: string;
  resume?: ResumeExtras<ExperienceEntry>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [focusNew, setFocusNew] = useState(false);
  const { button, panel } = useDescribe('experience', describe);
  useNavOpen('experience', resume?.nav, setOpenIndex);
  const groups = groupBySection(value);
  const sections = value.length === 0 ? [DEFAULT_SECTION] : sectionOrder(value);
  const bulletTotal = value.reduce((total, entry) => total + entry.bullets.length, 0);

  function add(label: string) {
    const { entries, index } = addEntryToSection(value, label, newExperienceEntry);
    onChange(entries);
    setOpenIndex(index);
    setFocusNew(true);
  }

  const lastSection = groups.length > 0 ? groups[groups.length - 1].label : DEFAULT_SECTION;

  return (
    <SheetSection
      id="experience"
      title={title}
      meta={value.length > 0 ? `${count(value.length, 'role')} · ${count(bulletTotal, 'highlight')}` : undefined}
      actions={
        <>
          {resume?.actions}
          {button}
          <Btn size="sm" variant="ghost" onClick={() => add(lastSection)}>
            <Plus size={13} />
            Add a role
          </Btn>
        </>
      }
    >
      {panel}
      {value.length === 0 ? (
        <EmptySection>
          No roles yet. Jobs, internships, org positions and volunteer work all count. Start with the most recent.
        </EmptySection>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label}>
              {groups.length > 1 && (
                <h3 className="mb-1 border-b border-slate-200 pb-1.5 text-sm font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  {group.label}
                </h3>
              )}
              <InlineEntryList<ExperienceEntry>
                items={value}
                indexes={group.items.map((item) => item.index)}
                onChange={onChange}
                duplicate={(entry) => ({ ...entry, bullets: [...entry.bullets] })}
                noun="role"
                compact={Boolean(resume)}
                openIndex={openIndex}
                onOpen={setOpenIndex}
                focusNew={focusNew}
                onFocused={() => setFocusNew(false)}
                summary={(entry) => ({
                  // Role first, as on the printed resume and in the editor.
                  title: entry.title,
                  untitled: 'Untitled role',
                  subtitle: entry.company,
                  aside: dateRange(entry),
                  bullets: entry.bullets,
                  warning: bulletWarning(entry, resume),
                  badge: resume?.entryBadge?.(entry),
                })}
                renderDetail={({ index, entry, update, onDuplicate, onDelete, autoFocus, onFocused }) => (
                  <ExperienceDetail
                    noun={resume ? 'role from this resume' : undefined}
                    bulletBadge={resume?.bulletBadge}
                    belowBullets={resume?.belowBullets?.(entry, update)}
                    onBulletFocus={resume?.onFocusBullet && ((i) => resume.onFocusBullet?.(entry, i))}
                    onBulletBlur={resume?.onFocusBullet && (() => resume.onFocusBullet?.(entry, null))}
                    entry={entry}
                    onChange={update}
                    autoFocus={autoFocus}
                    onFocused={onFocused}
                    onSectionChange={(label) => {
                      const moved = setEntrySection(value, index, label);
                      onChange(moved.entries);
                      setOpenIndex(moved.index);
                    }}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    sections={sections}
                    bulletRewrite={bulletRewrite}
                  />
                )}
              />
            </div>
          ))}
        </div>
      )}
      <ExcludedEntries excluded={resume?.excluded} />
    </SheetSection>
  );
}

function newProjectEntry(): ProjectEntry {
  return { name: '', description: '', bullets: [], links: [] };
}

/**
 * Projects, one list.
 * In plain terms: the things you've built.
 */
export function ProjectsSection({
  value,
  onChange,
  describe,
  resume,
}: {
  value: ProjectEntry[];
  onChange: (next: ProjectEntry[]) => void;
  describe?: DescribeProps;
  resume?: ResumeExtras<ProjectEntry>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [focusNew, setFocusNew] = useState(false);
  const { button, panel } = useDescribe('project', describe);
  useNavOpen('projects', resume?.nav, setOpenIndex);
  const bulletTotal = value.reduce((total, entry) => total + entry.bullets.length, 0);

  function add() {
    onChange([...value, newProjectEntry()]);
    setOpenIndex(value.length);
    setFocusNew(true);
  }

  return (
    <SheetSection
      id="projects"
      title="Projects"
      meta={value.length > 0 ? `${count(value.length, 'project')} · ${count(bulletTotal, 'highlight')}` : undefined}
      actions={
        <>
          {resume?.actions}
          {button}
          <Btn size="sm" variant="ghost" onClick={add}>
            <Plus size={13} />
            Add a project
          </Btn>
        </>
      }
    >
      {panel}
      {value.length === 0 ? (
        <EmptySection>
          No projects yet. Class work, side projects and hackathon builds all count. Optional, but they give
          matching more to work with.
        </EmptySection>
      ) : (
        <InlineEntryList<ProjectEntry>
          items={value}
          onChange={onChange}
          duplicate={(entry) => ({
            ...entry,
            bullets: [...entry.bullets],
            links: entry.links.map((link) => ({ ...link })),
          })}
          noun="project"
          compact={Boolean(resume)}
          openIndex={openIndex}
          onOpen={setOpenIndex}
          focusNew={focusNew}
          onFocused={() => setFocusNew(false)}
          summary={(entry) => ({
            title: entry.name,
            untitled: 'Untitled project',
            subtitle: entry.description,
            bullets: entry.bullets,
            warning: bulletWarning(entry, resume),
            badge: resume?.entryBadge?.(entry),
          })}
          renderDetail={({ entry, update, onDuplicate, onDelete, autoFocus, onFocused }) => (
            <ProjectDetail
              noun={resume ? 'project from this resume' : undefined}
              bulletBadge={resume?.bulletBadge}
              belowBullets={resume?.belowBullets?.(entry, update)}
              onBulletFocus={resume?.onFocusBullet && ((i) => resume.onFocusBullet?.(entry, i))}
              onBulletBlur={resume?.onFocusBullet && (() => resume.onFocusBullet?.(entry, null))}
              entry={entry}
              onChange={update}
              autoFocus={autoFocus}
              onFocused={onFocused}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              bulletRewrite={bulletRewrite}
            />
          )}
        />
      )}
      <ExcludedEntries excluded={resume?.excluded} />
    </SheetSection>
  );
}

function newEducationEntry(): EducationEntry {
  return { school: '', degree: '', current: false };
}

/**
 * Education, one list.
 * In plain terms: your schools and degrees.
 */
export function EducationSection({
  value,
  onChange,
  resume,
}: {
  value: EducationEntry[];
  onChange: (next: EducationEntry[]) => void;
  resume?: Pick<ResumeExtras<EducationEntry>, 'actions' | 'nav'>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [focusNew, setFocusNew] = useState(false);
  useNavOpen('education', resume?.nav, setOpenIndex);

  function add() {
    onChange([...value, newEducationEntry()]);
    setOpenIndex(value.length);
    setFocusNew(true);
  }

  return (
    <SheetSection
      id="education"
      title="Education"
      meta={value.length > 0 ? count(value.length, 'school') : undefined}
      actions={
        <>
          {resume?.actions}
          <Btn size="sm" variant="ghost" onClick={add}>
            <Plus size={13} />
            Add a school
          </Btn>
        </>
      }
    >
      {value.length === 0 ? (
        <EmptySection>No schools yet. Optional, but most resumes list one.</EmptySection>
      ) : (
        <InlineEntryList<EducationEntry>
          items={value}
          onChange={onChange}
          duplicate={(entry) => ({ ...entry, details: [...(entry.details ?? [])] })}
          noun="school"
          openIndex={openIndex}
          onOpen={setOpenIndex}
          focusNew={focusNew}
          onFocused={() => setFocusNew(false)}
          summary={(entry) => ({
            title: entry.school,
            untitled: 'Untitled school',
            subtitle: [entry.degree, entry.field].filter((part) => part?.trim()).join(', '),
            aside: dateRange(entry),
            bullets: entry.details ?? [],
          })}
          renderDetail={({ entry, update, onDuplicate, onDelete, autoFocus, onFocused }) => (
            <EducationDetail
              entry={entry}
              onChange={update}
              autoFocus={autoFocus}
              onFocused={onFocused}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          )}
        />
      )}
    </SheetSection>
  );
}

/**
 * Name and contact details, shown as the top of a resume until you press
 * Edit, then the contact form in its place. Opens straight into the form
 * while the name is still empty.
 * In plain terms: your name, email, phone and links.
 */
export function ContactSection({
  value,
  onChange,
  alwaysEditing = false,
  navNonce,
}: {
  value: Contact;
  onChange: (next: Contact) => void;
  /** The guided setup shows only the form, with no Done. */
  alwaysEditing?: boolean;
  /** Changes when a preview click asks to edit the contact details. */
  navNonce?: number;
}) {
  const [editing, setEditing] = useState(() => value.name.trim() === '');
  useNavOpen('contact', navNonce === undefined ? null : { index: 0, nonce: navNonce }, () => setEditing(true));

  if (alwaysEditing) {
    return (
      <div id="contact">
        <ContactForm value={value} onChange={onChange} />
      </div>
    );
  }

  if (editing) {
    return (
      <div id="contact" className="scroll-mt-20">
        <ContactForm value={value} onChange={onChange} />
        <div className="mt-2 flex justify-end">
          <Btn size="sm" onClick={() => setEditing(false)}>
            <Check size={13} />
            Done
          </Btn>
        </div>
      </div>
    );
  }

  const details = [value.email, value.phone, value.location, ...value.links.map((link) => link.url)].filter(
    (part) => part?.trim(),
  );

  return (
    <Card className="p-4 sm:p-6 scroll-mt-20">
      <section id="contact" aria-label="Contact" className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value.name}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
            {details.length > 0 ? (
              details.map((part, i) => (
                <span key={i} className="break-all">
                  {part}
                </span>
              ))
            ) : (
              <span>No contact details yet</span>
            )}
          </p>
        </div>
        <Btn size="sm" variant="secondary" onClick={() => setEditing(true)} ariaLabel="Edit contact details">
          <Pencil size={13} />
          Edit
        </Btn>
      </section>
    </Card>
  );
}

/**
 * Skills as the resume prints them, one line per category, until you press
 * Edit; then the skills editor in its place. Opens straight into the editor
 * while there are no skills.
 * In plain terms: your skill list, and the button to change it.
 */
export function SkillsSection({
  value,
  onChange,
  actions,
  onReset,
  navNonce,
}: {
  value: SkillGroup[];
  onChange: (next: SkillGroup[]) => void;
  /** Extra header buttons while reading, e.g. the resume's Reset. */
  actions?: ReactNode;
  /** Passed to the skills editor, which shows its own Reset. */
  onReset?: () => void;
  /** Changes when a preview click asks to edit the skills. */
  navNonce?: number;
}) {
  const total = value.reduce((sum, group) => sum + group.items.length, 0);
  const [editing, setEditing] = useState(() => total === 0);
  useNavOpen('skills', navNonce === undefined ? null : { index: 0, nonce: navNonce }, () => setEditing(true));

  if (editing) {
    return (
      <div id="skills" className="scroll-mt-20">
        <SkillsForm value={value} onChange={onChange} onReset={onReset} />
        <div className="mt-2 flex justify-end">
          <Btn size="sm" onClick={() => setEditing(false)}>
            <Check size={13} />
            Done
          </Btn>
        </div>
      </div>
    );
  }

  const groups = value.filter((group) => group.items.length > 0);
  return (
    <SheetSection
      id="skills"
      title="Skills"
      meta={count(total, 'skill')}
      actions={
        <>
          {actions}
          <Btn size="sm" variant="ghost" onClick={() => setEditing(true)} ariaLabel="Edit skills">
            <Pencil size={13} />
            Edit
          </Btn>
        </>
      }
    >
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-3 w-[calc(100%+1.5rem)] rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 dark:text-slate-300 dark:hover:bg-slate-800/50"
      >
        {groups.map((group, i) => (
          <span key={i} className="block py-0.5">
            {group.category.trim() && (
              <span className="font-semibold text-slate-900 dark:text-slate-100">{group.category}: </span>
            )}
            {group.items.join(', ')}
          </span>
        ))}
      </button>
    </SheetSection>
  );
}
