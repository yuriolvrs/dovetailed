// What this file is: the result shape one page frame returns after filling, plus the functions that merge frame results and format the field report. No field values are ever included.
// In plain terms: the summary the popup shows, and the text you can copy to help us support a new site.
import { atsOriginFor } from './atsHosts';

export interface ReportedField {
  control: string;
  kind: string;
  label: string;
}

/** What happened to the resume in one frame. */
export type ResumeOutcome =
  | { status: 'attached'; fileName: string }
  | { status: 'already' }
  | { status: 'ambiguous'; labels: string[] }
  | { status: 'not-stored' }
  | { status: 'not-found' };

export interface FrameResult {
  /** Address of the frame. Used for the host only. */
  url: string;
  blocked: boolean;
  formFound: boolean;
  filled: number;
  /** Labels of required fields still empty. */
  requiredBlank: string[];
  /** Fields we tried and could not finish. */
  incomplete: { label: string; reason: string }[];
  fields: ReportedField[];
  resume?: ResumeOutcome;
  /** Top frame only: addresses of known job-board iframes on the page. */
  atsIframes?: string[];
}

export interface MergedResult {
  filled: number;
  formFound: boolean;
  requiredBlank: string[];
  incomplete: { label: string; reason: string }[];
  /** Match patterns for known job-board iframes that returned no result. */
  unreachable: string[];
  resume: ResumeOutcome;
}

const RESUME_PRIORITY: ResumeOutcome['status'][] = ['attached', 'already', 'ambiguous', 'not-stored', 'not-found'];

/** The most informative resume outcome among the frames. */
function bestResume(frames: FrameResult[]): ResumeOutcome {
  const outcomes = frames.map((f) => f.resume ?? { status: 'not-found' as const });
  outcomes.sort((a, b) => RESUME_PRIORITY.indexOf(a.status) - RESUME_PRIORITY.indexOf(b.status));
  return outcomes[0] ?? { status: 'not-found' };
}

/** Merges the results of all frames. */
export function mergeResults(frames: FrameResult[]): MergedResult {
  const live = frames.filter((f) => !f.blocked);
  const reached = new Set(frames.map((f) => atsOriginFor(f.url)).filter((o): o is string => !!o));
  const iframes = frames.flatMap((f) => f.atsIframes ?? []);
  const unreachable = [...new Set(iframes.map(atsOriginFor).filter((o): o is string => !!o && !reached.has(o)))];
  return {
    filled: live.reduce((n, f) => n + f.filled, 0),
    formFound: live.some((f) => f.formFound),
    requiredBlank: [...new Set(live.flatMap((f) => f.requiredBlank))],
    incomplete: live.flatMap((f) => f.incomplete),
    unreachable,
    resume: bestResume(live),
  };
}

/** One line per field: control, classification and label. It never holds a value. */
export function formatFieldReport(frames: FrameResult[]): string {
  const lines: string[] = [];
  for (const f of frames) {
    if (f.blocked || f.fields.length === 0) continue;
    let host = '';
    try {
      host = new URL(f.url).hostname;
    } catch {
      /* no host */
    }
    lines.push(`# ${host || 'frame'}`);
    for (const field of f.fields) lines.push(`${field.control} | ${field.kind} | ${field.label}`);
  }
  return lines.join('\n');
}
