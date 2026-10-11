// What this file is: the landing page on / for someone with no profile and no
// saved postings. It shows one example person's resume before and after
// tailoring to one posting: each tailored line names the requirement it
// answers and lights the line it came from, and a requirement nothing answers
// stays a gap. Then how the app works and where the data stays.
// In plain terms: the first page a new visitor sees, showing what Dovetailed
// does to a resume instead of describing it.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Check, Shield, Upload } from 'lucide-react';
import { Btn } from '../ui/primitives';

type ReqId = 'events' | 'writing' | 'design' | 'video';

// The example posting's requirements. `short` is the badge on a resume line;
// `gap` marks the one nothing on Sam's resume answers.
const REQUIREMENTS: { id: ReqId; text: string; short: string; gap?: boolean }[] = [
  { id: 'events', text: 'Experience organizing student or community events', short: 'Events' },
  { id: 'writing', text: 'Strong written communication in English', short: 'Writing' },
  { id: 'design', text: 'Familiarity with Canva or similar design tools', short: 'Design tools' },
  { id: 'video', text: 'Video editing for event recaps', short: 'Video', gap: true },
];

// A line on a sheet. On the tailored sheet, `req` is the requirement it
// answers and `from` is the id of the line on the general resume it was
// reworded or moved from, so every tailored line has a visible source.
type Line = { id: string; text: string; req?: ReqId; from?: string };
type Entry = { title: string; org: string; lines: Line[] };
type Sheet = { sections: { name: string; entries: Entry[] }[]; skills: Line };

const RECIPE_APP: Entry = {
  title: 'Recipe Finder',
  org: 'Class project',
  lines: [{ id: 'p1', text: 'Built a web app that suggests meals from what is in the fridge' }],
};

const BEFORE: Sheet = {
  sections: [
    { name: 'Projects', entries: [RECIPE_APP] },
    {
      name: 'Experience',
      entries: [
        {
          title: 'Volunteer Coordinator',
          org: 'Hillside Community Library',
          lines: [
            { id: 'e1', text: 'In charge of the monthly reading fairs and book drives' },
            { id: 'e2', text: 'Wrote grant requests and the monthly newsletter' },
          ],
        },
        {
          title: 'Staff Writer',
          org: 'The Campus Ledger (student paper)',
          lines: [{ id: 'e3', text: 'Wrote feature articles and event coverage' }],
        },
      ],
    },
  ],
  skills: { id: 's1', text: 'Python, JavaScript, Excel, Canva' },
};

const AFTER: Sheet = {
  sections: [
    {
      name: 'Experience',
      entries: [
        {
          title: 'Volunteer Coordinator',
          org: 'Hillside Community Library',
          lines: [
            { id: 't1', text: 'Organized the monthly reading fairs and book drives', req: 'events', from: 'e1' },
            { id: 't2', text: 'Wrote grant requests and the monthly newsletter', req: 'writing', from: 'e2' },
          ],
        },
        {
          title: 'Staff Writer',
          org: 'The Campus Ledger (student paper)',
          lines: [{ id: 't3', text: 'Wrote feature articles and event coverage', req: 'writing', from: 'e3' }],
        },
      ],
    },
    { name: 'Projects', entries: [RECIPE_APP] },
  ],
  skills: { id: 't4', text: 'Canva, Excel, Python, JavaScript', req: 'design', from: 's1' },
};

// Ids of the general-resume lines behind a requirement's tailored lines.
function sourcesOf(req: ReqId | null): Set<string> {
  const lines = [...AFTER.sections.flatMap((s) => s.entries.flatMap((e) => e.lines)), AFTER.skills];
  return new Set(lines.filter((l) => req && l.req === req && l.from).map((l) => l.from!));
}

const HEAD = 'mt-3 border-b border-slate-900 text-[11px] font-bold uppercase tracking-wide';

/**
 * One resume sheet, drawn like the app's resume preview (Outfit, bold name,
 * ruled uppercase section heads). On the tailored sheet, matched lines carry
 * a badge and highlight; on the general one, a line lights up when a
 * tailored line made from it is pointed at.
 * In plain terms: a small resume page, with the matched lines marked.
 */
function ResumeSheet({
  sheet,
  tailored,
  active,
  onPoint,
}: {
  sheet: Sheet;
  tailored: boolean;
  active: ReqId | null;
  onPoint: (req: ReqId | null) => void;
}) {
  const sources = sourcesOf(active);
  const lit = (line: Line) => (tailored ? active !== null && line.req === active : sources.has(line.id));
  const lineClass = (line: Line) => {
    if (lit(line)) return 'bg-emerald-200';
    return tailored && line.req && active === null ? 'bg-emerald-50' : '';
  };
  const renderLine = (line: Line) => (
    <>
      <span className={`rounded-sm transition-colors duration-200 ${lineClass(line)}`}>{line.text}</span>
      {tailored && line.req && (
        <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-0.5 whitespace-nowrap rounded-full bg-emerald-100 px-1.5 py-px text-[11px] font-medium text-emerald-800">
          <Check size={10} aria-hidden />
          {REQUIREMENTS.find((r) => r.id === line.req)?.short}
        </span>
      )}
    </>
  );
  const pointable = (line: Line) =>
    tailored && line.req ? { onMouseEnter: () => onPoint(line.req!), onMouseLeave: () => onPoint(null) } : {};

  return (
    <div
      className={`rounded-lg px-5 py-5 font-sans text-[13px] leading-snug ${
        tailored
          ? 'bg-white text-slate-900 ring-2 ring-blue-600 shadow-[0_8px_24px_rgba(15,23,42,0.14)] dark:ring-blue-400 dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)]'
          : 'border border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-400 dark:bg-slate-300'
      }`}
    >
      <p className="text-center text-[15px] font-bold tracking-wide">Sam Reyes</p>
      <p className="text-center text-xs">sam@example.com | Cebu City</p>
      {sheet.sections.map((section) => (
        <div key={section.name}>
          <p className={HEAD}>{section.name}</p>
          {section.entries.map((entry) => (
            <div key={entry.title} className="mt-1.5">
              <p className="font-bold">{entry.title}</p>
              <p className="italic">{entry.org}</p>
              <ul className="mt-0.5 list-disc pl-4">
                {entry.lines.map((line) => (
                  <li key={line.id} {...pointable(line)}>
                    {renderLine(line)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      <p className={HEAD}>Skills</p>
      <p className="mt-1" {...pointable(sheet.skills)}>
        {renderLine(sheet.skills)}
      </p>
    </div>
  );
}

/**
 * The worked example: the posting's requirements as toggle buttons, and the
 * two resumes. Hovering or focusing a requirement previews its lines;
 * clicking or tapping pins it, so touch works too.
 * In plain terms: the before-and-after picture at the top of the page.
 */
function BeforeAfter() {
  const [pinned, setPinned] = useState<ReqId | null>(null);
  const [preview, setPreview] = useState<ReqId | null>(null);
  const active = preview ?? pinned;
  const activeReq = REQUIREMENTS.find((r) => r.id === active);

  return (
    <figure className="min-w-0">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <figcaption className="text-sm text-slate-600 dark:text-slate-400">
          Example posting:{' '}
          <span className="font-medium text-slate-900 dark:text-slate-100">
            Junior Events and Communications Associate
          </span>
        </figcaption>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="What the posting asks for">
          {REQUIREMENTS.map((req) => (
            <li key={req.id}>
              <button
                type="button"
                aria-pressed={pinned === req.id}
                onMouseEnter={() => setPreview(req.id)}
                onMouseLeave={() => setPreview(null)}
                onFocus={() => setPreview(req.id)}
                onBlur={() => setPreview(null)}
                onClick={() => {
                  // On touch, focus keeps the preview set; clear it so unpinning shows.
                  if (pinned === req.id) setPreview(null);
                  setPinned(pinned === req.id ? null : req.id);
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active === req.id
                    ? req.gap
                      ? 'border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-400 dark:bg-amber-500/15 dark:text-amber-200'
                      : 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-200'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {req.text}
                {req.gap && (
                  <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                    Gap
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
          {activeReq?.gap
            ? 'Nothing Sam has done answers this one, so it stays a gap. Dovetailed does not write a line for it.'
            : activeReq
              ? 'Lit on the left: the line each tailored line was made from.'
              : 'Point at or tap a requirement to see the lines that answer it, and where they came from.'}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Sam's resume as it is</p>
          <ResumeSheet sheet={BEFORE} tailored={false} active={active} onPoint={setPreview} />
        </div>
        {/* On a phone the tailored sheet comes first, right under the
            requirements, so a tap lights lines on screen. */}
        <div className="order-first min-w-0 sm:order-none">
          <p className="mb-2 text-sm font-medium text-blue-700 dark:text-blue-400">Sam's resume, tailored for the job posting above</p>
          <ResumeSheet sheet={AFTER} tailored active={active} onPoint={setPreview} />
        </div>
      </div>
    </figure>
  );
}

// The match rows How it works shows: the hero posting's own requirements and counts.
const MATCH_ROWS: { text: string; found: string | null }[] = [
  { text: 'Organizing community events', found: '1 line' },
  { text: 'Written communication', found: '2 lines' },
  { text: 'Canva or design tools', found: '1 line' },
  { text: 'Video editing', found: null },
];

/**
 * How it works as one connected strip: the profile going in, the match, and
 * the tailored resume coming out, each with a piece of the real screen.
 * In plain terms: the three steps, left to right, joined by arrows.
 */
function HowItWorks() {
  const steps = [
    {
      title: 'Add your experience once',
      body: 'Read it from your resume file, or type it in.',
      sample: (
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          <Upload size={18} aria-hidden className="shrink-0" />
          Drop a PDF or Word file, or paste the text
        </div>
      ),
    },
    {
      title: 'Paste a job posting',
      body: 'Each requirement is matched to what you have done. What nothing answers shows as a gap.',
      sample: (
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {MATCH_ROWS.map(({ text, found }) => (
            <li key={text} className="flex items-center justify-between gap-3 py-1.5 text-slate-700 dark:text-slate-300">
              {text}
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  found
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                }`}
              >
                {found ?? 'Gap'}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      title: 'Get a resume and cover letter',
      body: 'Edit any line, then export a PDF or fill your own LaTeX template.',
      sample: (
        <div className="rounded-lg bg-white px-4 py-3 text-[13px] leading-snug text-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
          <p className="border-b border-slate-900 text-[11px] font-bold uppercase tracking-wide">Experience</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              Organized the monthly reading fairs and book drives
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 text-[11px] font-medium text-emerald-800">
                <Check size={10} aria-hidden />
                Events
              </span>
            </li>
            <li>
              Wrote grant requests and the monthly newsletter
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 text-[11px] font-medium text-emerald-800">
                <Check size={10} aria-hidden />
                Writing
              </span>
            </li>
          </ul>
        </div>
      ),
    },
  ];

  return (
    <section aria-labelledby="how-it-works" className="mt-20 sm:mt-24">
      <h2 id="how-it-works" className="scroll-mt-24 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        How it works
      </h2>
      <ol className="mt-5 grid grid-cols-[minmax(0,1fr)] divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white md:grid-cols-3 md:divide-x md:divide-y-0 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {steps.map((step, i) => (
          <li key={step.title} className="relative p-5">
            {i > 0 && (
              <span
                aria-hidden
                className="absolute -left-3.5 top-8 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 md:flex dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
              >
                <ArrowRight size={14} />
              </span>
            )}
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              <span className="mr-2 text-blue-700 dark:text-blue-400">{i + 1}</span>
              {step.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.body}</p>
            <div className="mt-4">{step.sample}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The welcome page. `onStart` goes to the Profile page to read a resume file;
 * `onTypeIn` goes straight to the step-by-step setup.
 * In plain terms: the landing page and its buttons.
 */
export function Welcome({ onStart, onTypeIn }: { onStart: () => void; onTypeIn: () => void }) {
  const start = (
    <Btn onClick={onStart}>
      Start with your resume
      <ArrowRight size={14} />
    </Btn>
  );

  return (
    <div className="pb-16 pt-2 sm:pt-8 selection:bg-blue-200 dark:selection:bg-blue-500/40">
      <section className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-14">
        <div className="min-w-0 lg:pt-10">
          <h1 className="max-w-[14ch] text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-5xl dark:text-slate-100">
            Same you. A different resume for every job.
          </h1>
          <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-slate-600 dark:text-slate-400">
            Paste a job posting. Dovetailed picks, orders and words your own experience for it, and writes the cover
            letter. Each line is traced to something you wrote; anything it cannot trace is flagged.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {start}
            <Btn variant="secondary" onClick={onTypeIn}>
              Type it in instead
            </Btn>
          </div>
          <Link
            to="/settings"
            className="mt-4 inline-block text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Have a backup? Restore it
          </Link>
          <a
            href="#how-it-works"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="mt-12 hidden items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 lg:flex dark:text-slate-400 dark:hover:text-slate-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 motion-safe:[animation:nudge-down_1.2s_cubic-bezier(0.25,1,0.5,1)_3] dark:border-slate-700">
              <ArrowDown size={14} aria-hidden />
            </span>
            See how it works
          </a>
        </div>
        <BeforeAfter />
      </section>

      <HowItWorks />

      <section className="mt-16 flex flex-col gap-5 rounded-2xl bg-slate-100 px-6 py-6 sm:flex-row sm:items-center sm:justify-between dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <Shield size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-600 dark:text-slate-400" />
          <p className="max-w-[70ch] text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-900 dark:text-slate-100">No account, and nothing stored on a server.</span>{' '}
            Your profile and postings stay in this browser. To write for you, Dovetailed sends only the text or file a
            step needs, to AI services that do not train on it.{' '}
            <Link to="/about" className="underline underline-offset-4 hover:text-slate-900 dark:hover:text-slate-100">
              What leaves your browser
            </Link>
          </p>
        </div>
        <div className="shrink-0">{start}</div>
      </section>
    </div>
  );
}
