// What this file is: the prompt and response validator for turning an
// uploaded document (an old job description, offer letter, or role summary)
// into one new profile entry -- either a job (experience) or a project.
// Unlike extractProfile.ts's verbatim transcription, this is a writing task:
// the identifying fields (company/title/dates, or name/description) are
// still transcribed verbatim, but the bullets are generated/reworded for
// ATS readability. That makes it the same anti-fabrication risk
// suggestBulletRewrite.ts already solved for per-bullet rewording --
// verifyGeneratedEntry.ts reuses that same check against the whole document
// instead of a single original bullet.
// In plain terms: asks the AI to read a document about a job or project you
// had and turn it into a resume-ready entry, using only what the document
// actually says.

// All fields optional here (unlike the stored ExperienceEntry/ProjectEntry
// types) -- a document isn't guaranteed to state a company name or dates,
// and the prompt is told to omit rather than guess.
export interface ExtractedGeneratedExperience {
  company?: string;
  title?: string;
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  location?: string;
  current?: boolean;
}
export interface ExtractedGeneratedProject {
  name?: string;
  description?: string;
}

export interface GeneratedEntry {
  kind: 'experience' | 'project';
  experience?: ExtractedGeneratedExperience;
  project?: ExtractedGeneratedProject;
  bullets: string[];
}

const MAX_DOCUMENT_CHARS = 12_000;

/**
 * In plain terms: the instructions sent to the AI when you upload a document
 * describing a job or project you had.
 */
export function buildGenerateEntryFromDocumentPrompt(documentText: string): string {
  const document = documentText.slice(0, MAX_DOCUMENT_CHARS);

  return `You are turning a document about a job or project someone had into one resume profile entry.

Read the DOCUMENT below -- it may be a job description, an offer letter, a role summary, or a
project brief -- and do two things:

1. Decide "kind": "experience" if the document describes a job/role at an employer, or "project"
   if it describes a personal, academic, or freelance project with no employer.
2. Extract the identifying fields VERBATIM from the document. Do not invent a company, title,
   name, or date the document doesn't state -- omit a field entirely rather than guess it.
   - For "experience": company, title, startMonth (full month name), startYear (4-digit string),
     endMonth, endYear, location. Set "current" true only if the document says the role is ongoing.
   - For "project": name, description (one sentence).
3. Write 3 to 6 resume bullet points describing responsibilities and accomplishments, in strong
   action-verb, ATS-friendly phrasing. You may rephrase and condense using the document's own
   wording -- but do NOT add any skill, technology, tool, metric, percentage, duration, or
   achievement that isn't already stated in the document. Do not invent outcomes the document
   doesn't mention.

Respond with JSON only, no markdown fences, in this exact shape:
{"kind":"experience","experience":{"company":"","title":"","startMonth":"","startYear":"","endMonth":"","endYear":"","location":"","current":false},"bullets":["…"]}

or, if kind is "project":
{"kind":"project","project":{"name":"","description":""},"bullets":["…"]}

Only include the "experience" key when kind is "experience", and only "project" when kind is "project".

DOCUMENT:
${document}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

/**
 * Structural validator for generateStructured.
 * In plain terms: checks the AI's response actually looks like one
 * well-formed profile entry before we show it to you.
 */
export function isGeneratedEntry(value: unknown): value is GeneratedEntry {
  if (!isObject(value)) return false;
  if (value.kind !== 'experience' && value.kind !== 'project') return false;
  if (!Array.isArray(value.bullets) || !value.bullets.every((b) => typeof b === 'string' && b.trim() !== '')) {
    return false;
  }

  if (value.kind === 'experience') {
    if (!isObject(value.experience)) return false;
    const e = value.experience;
    if (
      !optionalString(e.company) ||
      !optionalString(e.title) ||
      !optionalString(e.startMonth) ||
      !optionalString(e.startYear) ||
      !optionalString(e.endMonth) ||
      !optionalString(e.endYear) ||
      !optionalString(e.location)
    ) {
      return false;
    }
  }

  if (value.kind === 'project') {
    if (!isObject(value.project)) return false;
    if (!optionalString(value.project.name) || !optionalString(value.project.description)) return false;
  }

  return true;
}
