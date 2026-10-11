// What this file is: the guided setup for a profile started from scratch.
// One section per step (you, work, projects, skills, education, then a
// check), with the resume filling in beside the form as you type. Each step
// edits the same profile through the same section components as the
// one-page Profile, and finishing lands there.
// In plain terms: walks a new user through their profile one question at a
// time, showing the resume it makes as they go.

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-react';
import type { Profile } from '../../types';
import { computeProfileCompleteness, hasBullets } from '../../lib/profileStore';
import { ResumePrintView } from '../resume/ResumePrintView';
import { Btn, SavedIndicator } from '../ui/primitives';
import { SkillsForm } from './SkillsForm';
import { ContactSection, EducationSection, ExperienceSection, ProjectsSection } from './ProfileSections';
import type { DescribeProps } from './ProfileSections';

type StepId = 'contact' | 'experience' | 'projects' | 'skills' | 'education' | 'review';

const STEPS: { id: StepId; label: string; heading: string; lede: string; optional?: boolean }[] = [
  {
    id: 'contact',
    label: 'You',
    heading: 'Who are you?',
    lede: 'Your name and how to reach you. This is the top of every resume.',
  },
  {
    id: 'experience',
    label: 'Work',
    heading: 'Where have you worked?',
    lede: 'Start with your most recent role. Jobs, internships, org positions and volunteer work all count. Dovetailed only ever uses what you write here.',
  },
  {
    id: 'projects',
    label: 'Projects',
    heading: 'What have you built?',
    lede: 'Class work, side projects, hackathon builds. Skip this if you have none.',
    optional: true,
  },
  {
    id: 'skills',
    label: 'Skills',
    heading: 'What are you good at?',
    lede: 'Languages, tools, frameworks. Type one and press Enter, or paste a comma-separated list.',
  },
  {
    id: 'education',
    label: 'Education',
    heading: 'Where did you study?',
    lede: 'Your school and degree. Optional, but most resumes list one.',
    optional: true,
  },
  {
    id: 'review',
    label: 'Check it over',
    heading: 'Check it over',
    lede: 'Your resume so far is on the right. You can change anything later from the Profile page.',
  },
];

// How each readiness check reads in the review step.
const MISSING_LABELS: Record<string, { text: string; step: StepId }> = {
  Name: { text: 'Your name', step: 'contact' },
  Email: { text: 'Your email', step: 'contact' },
  Skills: { text: 'At least one skill', step: 'skills' },
  Highlights: { text: 'A bullet on a job or project', step: 'experience' },
};

/**
 * The short status under each step in the rail, e.g. "2 roles" or "Optional".
 * In plain terms: the little grey note under each step name.
 */
function stepNote(id: StepId, profile: Profile, optional?: boolean): string | undefined {
  const n = (k: number, noun: string) => `${k} ${noun}${k === 1 ? '' : 's'}`;
  if (id === 'contact') return profile.contact.name.trim() || undefined;
  if (id === 'experience' && profile.experience.length > 0) return n(profile.experience.length, 'role');
  if (id === 'projects' && profile.projects.length > 0) return n(profile.projects.length, 'project');
  if (id === 'skills') {
    const total = profile.skills.reduce((sum, group) => sum + group.items.length, 0);
    if (total > 0) return n(total, 'skill');
  }
  if (id === 'education' && profile.education.length > 0) return n(profile.education.length, 'school');
  return optional ? 'Optional' : undefined;
}

/**
 * Whether a step has anything in it yet, which ticks it in the rail.
 * In plain terms: has this step been filled in?
 */
function stepDone(id: StepId, profile: Profile): boolean {
  switch (id) {
    case 'contact':
      return profile.contact.name.trim() !== '' && profile.contact.email.trim() !== '';
    case 'experience':
      return profile.experience.some(hasBullets);
    case 'projects':
      return profile.projects.length > 0;
    case 'skills':
      return profile.skills.some((group) => group.items.length > 0);
    case 'education':
      return profile.education.length > 0;
    case 'review':
      return false;
  }
}

export function ProfileSetup({
  profile,
  update,
  describe,
  saved,
  onReadResume,
  onFinish,
}: {
  profile: Profile;
  update: (patch: Partial<Profile>) => void;
  describe: DescribeProps;
  saved: boolean;
  /** Back to the start screen, to read a resume file instead. */
  onReadResume: () => void;
  onFinish: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const step = STEPS[stepIndex];
  const next = STEPS[stepIndex + 1];
  const completeness = computeProfileCompleteness(profile);

  // Moving to a step puts focus on its heading, so keyboard and screen-reader
  // users start at the new question instead of on the button they pressed.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [stepIndex]);

  return (
    <div className="pb-16 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_24rem]">
      <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">Set up your profile</h2>
        <ol className="flex gap-1 overflow-x-auto lg:flex-col [scrollbar-width:none]">
          {STEPS.map((s, i) => {
            const current = i === stepIndex;
            const done = !current && stepDone(s.id, profile);
            const note = stepNote(s.id, profile, s.optional);
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setStepIndex(i)}
                  aria-current={current ? 'step' : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 ${
                    current
                      ? 'bg-white text-slate-900 shadow-[0_1px_4px_rgba(15,23,42,0.06)] dark:bg-slate-900 dark:text-slate-100 dark:shadow-none'
                      : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-100'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                      current
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : done
                          ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                          : 'border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap">{s.label}</span>
                    {note && (
                      <span className="hidden truncate text-xs font-normal text-slate-500 dark:text-slate-400 lg:block">
                        {note}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-6 hidden border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 lg:block">
          Have a resume file?{' '}
          <button
            type="button"
            onClick={onReadResume}
            className="font-medium text-slate-900 underline underline-offset-2 hover:text-slate-600 dark:text-slate-100 dark:hover:text-slate-300"
          >
            Read it instead
          </button>
          . It fills these steps for you.
        </p>
      </aside>

      <div className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Step {stepIndex + 1} of {STEPS.length}
          <span className="ml-3">
            <SavedIndicator visible={saved} />
          </span>
        </p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 focus:outline-none dark:text-slate-100"
        >
          {step.heading}
        </h1>
        <p className="mt-1 mb-6 max-w-[65ch] text-slate-600 dark:text-slate-400">{step.lede}</p>

        <div className="space-y-4">
          {step.id === 'contact' && (
            <ContactSection value={profile.contact} onChange={(contact) => update({ contact })} alwaysEditing />
          )}
          {step.id === 'experience' && (
            <ExperienceSection
              value={profile.experience}
              onChange={(experience) => update({ experience })}
              describe={describe}
            />
          )}
          {step.id === 'projects' && (
            <ProjectsSection
              value={profile.projects}
              onChange={(projects) => update({ projects })}
              describe={describe}
            />
          )}
          {step.id === 'skills' && <SkillsForm value={profile.skills} onChange={(skills) => update({ skills })} />}
          {step.id === 'education' && (
            <EducationSection value={profile.education} onChange={(education) => update({ education })} />
          )}
          {step.id === 'review' &&
            (completeness.missing.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <Check size={15} aria-hidden />
                Ready to tailor. Everything a resume needs is here.
              </p>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                <p className="flex items-center gap-2 font-medium">
                  <AlertCircle size={15} aria-hidden />
                  Before you can tailor to a job, add:
                </p>
                <ul className="mt-1.5 space-y-1 pl-6">
                  {completeness.missing.map((label) => {
                    const item = MISSING_LABELS[label];
                    return (
                      <li key={label}>
                        <button
                          type="button"
                          onClick={() => setStepIndex(STEPS.findIndex((s) => s.id === item.step))}
                          className="underline underline-offset-2 hover:text-red-950 dark:hover:text-white"
                        >
                          {item.text}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {stepIndex > 0 && (
            <Btn variant="secondary" onClick={() => setStepIndex(stepIndex - 1)}>
              <ArrowLeft size={14} />
              Back
            </Btn>
          )}
          {next ? (
            <Btn onClick={() => setStepIndex(stepIndex + 1)}>
              Continue to {next.label.toLowerCase()}
              <ArrowRight size={14} />
            </Btn>
          ) : (
            <Btn onClick={onFinish}>
              Go to my profile
              <ArrowRight size={14} />
            </Btn>
          )}
        </div>

        {/* Below xl there is no room beside the form, so the preview sits
            under it, one click away. */}
        <details className="group mt-8 xl:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 [&::-webkit-details-marker]:hidden">
            <ChevronRight size={14} aria-hidden className="transition-transform group-open:rotate-90" />
            Preview your resume
          </summary>
          <div className="mt-3 overflow-x-auto">
            <ResumePrintView content={profile} variant="preview" />
          </div>
        </details>
      </div>

      <aside aria-label="Resume preview" className="hidden xl:block xl:sticky xl:top-20 xl:self-start">
        <h2 className="mb-3 text-sm font-medium text-slate-500 dark:text-slate-400">Your resume, so far</h2>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto scroll-thin rounded-2xl">
          <ResumePrintView content={profile} variant="preview" />
        </div>
      </aside>
    </div>
  );
}
