// What this file is: the "nothing built yet" panel for the documents page's
// three tabs. Text and the action sit on the left; on the right a faint
// sketch shows the shape of what the button makes (a resume, a letter, a
// numbered question list), so the panel says what you will get, not only
// what to press.
// In plain terms: the panel you see before a resume, letter or question list
// exists, with a ghost of the finished thing beside the button.

import type { ReactNode } from 'react';
import { Card } from './primitives';

type Ghost = 'resume' | 'letter' | 'questions';

/** A row of faint bars standing in for one line of text. */
function Bar({ w, strong = false }: { w: string; strong?: boolean }) {
  return (
    <span
      className={`block h-1.5 rounded-full ${strong ? 'bg-slate-300 dark:bg-slate-600' : 'bg-slate-200 dark:bg-slate-700'}`}
      style={{ width: w }}
    />
  );
}

/**
 * The faint sketch of a finished document, drawn from bars. Decorative only.
 * In plain terms: a blurry outline of the page you are about to make.
 */
function GhostPage({ kind }: { kind: Ghost }) {
  return (
    <div
      aria-hidden
      className="w-60 space-y-2.5 rounded-lg bg-white p-5 shadow-[0_6px_20px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-[0_6px_24px_rgba(0,0,0,0.5)] dark:ring-slate-700"
    >
      {kind === 'resume' && (
        <>
          <span className="mx-auto block w-1/2">
            <Bar w="100%" strong />
          </span>
          {[0, 1].map((section) => (
            <div key={section} className="space-y-1.5 pt-1.5">
              <Bar w="35%" strong />
              <Bar w="92%" />
              <Bar w="80%" />
              <Bar w="86%" />
            </div>
          ))}
        </>
      )}
      {kind === 'letter' && (
        <>
          <Bar w="40%" strong />
          <Bar w="28%" />
          {[0, 1, 2].map((paragraph) => (
            <div key={paragraph} className="space-y-1.5 pt-1.5">
              <Bar w="96%" />
              <Bar w="90%" />
              <Bar w={paragraph === 2 ? '45%' : '70%'} />
            </div>
          ))}
        </>
      )}
      {kind === 'questions' &&
        [0, 1, 2, 3].map((question) => (
          <div key={question} className="flex items-start gap-2">
            <span className="mt-[-3px] text-[11px] font-semibold text-slate-400 dark:text-slate-500">{question + 1}</span>
            <span className="flex-1 space-y-1.5">
              <Bar w="94%" strong />
              <Bar w="60%" />
            </span>
          </div>
        ))}
    </div>
  );
}

/**
 * Empty-tab panel: heading, a sentence or two, the action, and optional
 * extras (an option, an error, a note) under it; the ghost page on the right
 * from the sm breakpoint.
 * In plain terms: what a documents tab shows before anything is built.
 */
export function DocumentEmptyState({
  ghost,
  title,
  icon,
  children,
  action,
  extra,
}: {
  ghost: Ghost;
  title: string;
  /** Optional icon before the title, e.g. a warning. */
  icon?: ReactNode;
  /** The explanation under the title. */
  children: ReactNode;
  action: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <Card className="grid gap-8 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-8 print:hidden">
      <div className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            {icon}
            {title}
          </h2>
          <p className="max-w-[52ch] text-sm leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>
        </div>
        <div>{action}</div>
        {extra}
      </div>
      <div className="hidden justify-center sm:flex">
        <GhostPage kind={ghost} />
      </div>
    </Card>
  );
}
