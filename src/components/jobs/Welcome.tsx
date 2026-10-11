// What this file is: the first-run welcome on / for someone with no profile
// and no saved postings. It says what the app does, shows one example of a
// traced resume line, and sends the visitor to the Profile page to start.
// In plain terms: the landing page a new visitor sees before they have added
// anything.

import { ArrowRight, Check, CornerDownRight, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Btn } from '../ui/primitives';

const STEPS = [
  {
    title: 'Add your experience once',
    body: 'Read it from your resume file, or type it in. Jobs, projects, skills, school.',
  },
  {
    title: 'Paste a job posting',
    body: 'Dovetailed reads the requirements and finds what you have done that fits each one.',
  },
  {
    title: 'Get a resume and cover letter',
    body: 'Written for that job. Each line points back to what you wrote, and you can edit any of it.',
  },
];

/**
 * A worked example of one traced line: a requirement from a posting, the
 * resume bullet written for it, and the profile entry it came from.
 * In plain terms: a small picture of what "every line is traced" means.
 */
function TracedLineExample() {
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <figcaption className="text-xs font-medium text-slate-500 dark:text-slate-400">Example</figcaption>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        The posting asks for
      </p>
      <p className="mt-1 text-sm text-slate-900 dark:text-slate-100">Experience organizing student or community events</p>

      <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Your resume says
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-900 dark:text-slate-100">
          Planned and ran community nights, tournaments and general assemblies as project head
        </p>
        <div className="mt-2">
          <Badge color="green">
            <Check size={11} aria-hidden />
            Matches this requirement
          </Badge>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
        <CornerDownRight size={15} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          From your profile: <span className="text-slate-900 dark:text-slate-100">Assistant Director for Internals</span>,
          an esports org, 2024 to now
        </span>
      </p>
    </figure>
  );
}

/**
 * The welcome screen. `onStart` goes to the Profile page.
 * In plain terms: the landing page and its one main button.
 */
export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <div className="pb-16 pt-4 sm:pt-10">
      <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
        <div className="min-w-0">
          <h1 className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl dark:text-slate-100">
            A resume for each job, made only from what you have done
          </h1>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-slate-600 dark:text-slate-400">
            Paste a job posting. Dovetailed matches it to your experience and drafts a resume and cover letter for
            that job. Each line is traced to something you wrote, and anything it cannot trace is flagged.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Btn onClick={onStart}>
              Start with your resume
              <ArrowRight size={14} />
            </Btn>
            <Link
              to="/settings"
              className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Have a backup? Restore it
            </Link>
          </div>
        </div>
        <TracedLineExample />
      </section>

      <section aria-labelledby="how-it-works" className="mt-16 sm:mt-20">
        <h2 id="how-it-works" className="text-sm font-medium text-slate-500 dark:text-slate-400">
          How it works
        </h2>
        <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{i + 1}</span>
              <h3 className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 flex items-start gap-3 rounded-2xl bg-slate-100 px-5 py-4 dark:bg-slate-900">
        <Shield size={16} aria-hidden className="mt-0.5 shrink-0 text-slate-600 dark:text-slate-400" />
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-900 dark:text-slate-100">No account, and nothing stored on a server.</span>{' '}
          Your profile and postings stay in this browser. To write for you, Dovetailed sends only the text a step
          needs to an AI service that does not train on it.{' '}
          <Link to="/about" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-slate-100">
            What leaves your browser
          </Link>
        </p>
      </section>
    </div>
  );
}
