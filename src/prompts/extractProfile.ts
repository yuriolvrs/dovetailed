// What this file is: the prompt and response validator for turning an
// uploaded resume's text into profile-shaped JSON. This is a transcription
// task, not a writing task -- the model copies what the document says and
// omits what it doesn't, and verifyExtraction.ts independently proves that
// afterwards.
// In plain terms: asks the AI to read your resume and fill in the profile
// fields using only words that are actually in it.

import type { Contact, EducationEntry, ExperienceEntry, ProjectEntry, SkillGroup } from '../types';

// The extracted shape deliberately differs from the stored one: a resume
// doesn't carry project links, and "current" is only known when the document
// actually says so. Modelling that here (rather than casting to the stored
// types and hoping) is what lets mergeProfile fill the gaps explicitly.
export type ExtractedExperience = Omit<ExperienceEntry, 'current'> & { current?: boolean };
export type ExtractedProject = Omit<ProjectEntry, 'links'>;
export type ExtractedEducation = Omit<EducationEntry, 'current'> & { current?: boolean };

/**
 * Contact as extracted: links come back as the bare text the resume shows
 * ("github.com/name"); mergeProfile turns them into labelled links.
 */
export type ExtractedContact = Partial<Omit<Contact, 'links'>> & { links?: string[] };

/** One possible typo found in the resume, with the likely fix. */
export interface SpellingNote {
  text: string;
  suggestion: string;
}

/** What the extractor is allowed to return -- a Profile minus the app-managed fields. */
export interface ExtractedProfile {
  contact: ExtractedContact;
  /** The resume's own summary or objective text, verbatim. */
  summary?: string;
  /** Possible typos the resume contains. Notes only; the extracted text is never corrected. */
  spelling?: SpellingNote[];
  skills: SkillGroup[];
  experience: ExtractedExperience[];
  projects: ExtractedProject[];
  education: ExtractedEducation[];
}

// A long resume plus the instructions has to stay comfortably inside the
// text model's context; the same cap-and-truncate approach analyzePosting.ts
// uses.
const MAX_DOCUMENT_CHARS = 18_000;

/**
 * Builds the extraction prompt from a document's text.
 * In plain terms: writes the instructions we send the AI along with your
 * resume's text.
 */
export function buildExtractProfilePrompt(documentText: string): string {
  const document = documentText.slice(0, MAX_DOCUMENT_CHARS);

  return `You are transcribing a resume into structured data.

CRITICAL RULES:
- Copy text VERBATIM from the document. Do not rewrite, rephrase, improve, summarize, or expand anything.
- Do not infer, guess, or invent. If the document does not state something, omit that field entirely.
- Never add skills, technologies, employers, or achievements that are not written in the document.
- Bullet points must be copied exactly as written, minus any leading "-", "*" or bullet character.
- The document is in markdown. Strip markdown formatting (#, **, -, |) from the values you return, but do not change the words themselves.

FIELD NOTES:
- "summary" is the resume's own summary, profile or objective paragraph, copied verbatim, without its heading. Use "" if the resume has none. Do not write one.
- "spelling" lists words in the resume that look misspelled, each as {"text": the word exactly as written, "suggestion": the correct spelling}. Use [] if there are none. Only list real typos, never names, brands or technical terms. Keep every other field exactly as written: do NOT fix the typo anywhere else.
- "experience.company" is the employer name only. Put the city or state in "location", never inside "company". If the resume prints "Riverbend Community Hospital, Vancouver, WA", the company is "Riverbend Community Hospital" and the location is "Vancouver, WA".
- "contact.links" lists every web address or profile link in the resume header (e.g. "linkedin.com/in/name", "github.com/name", a portfolio site), copied exactly. An email address is not a link.
- "skills" groups skills under the document's own category headings (e.g. "Languages", "Tools"). If the resume lists skills without categories, use a single group with category "Skills".
- "experience" is jobs/roles. "projects" is personal or academic projects. Do not move an item between them.
- Dates: use a full month name ("March") for the month and a 4-digit string for the year. Omit either if the document doesn't give it. Set "current": true only if the document says the role is ongoing (e.g. "Present").
- Dates are often at the far right of a line, after the school, degree, company, title or project name. Read them there too: "2022 – Present" on a degree line means startYear "2022" and "current": true.
- A project's "name" is its full title as written, up to any "|" separator (keep subtitles such as "Name - What it is").
- A project's "description" is the short text on its name line after the "|" separator, such as a tech stack (e.g. "Python, TensorFlow, OpenCV"), copied exactly. Do not put its dates there. Use "" if there is none.
- A project written as one line with no bullets under it is still a project. If the line is "Name (detail, detail)" or "Name: detail", split it: "name" is the part before the "(" or ":", and "description" is the rest, copied verbatim without the parentheses or colon. Do not add or change any word. If the line has no such detail, keep the whole line as "name" and use "" for "description".
- "bullets" is the list of description lines under an entry. If an entry has none, use an empty array.
- Omit "projects" entries entirely if the document has no projects section; return an empty array.

Return ONLY valid JSON in exactly this shape, with no commentary and no markdown fences:
{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "links": [""] },
  "summary": "",
  "spelling": [{ "text": "", "suggestion": "" }],
  "skills": [{ "category": "", "items": [""] }],
  "experience": [{ "company": "", "title": "", "startMonth": "", "startYear": "", "endMonth": "", "endYear": "", "current": false, "location": "", "bullets": [""] }],
  "projects": [{ "name": "", "description": "", "bullets": [""] }],
  "education": [{ "school": "", "degree": "", "field": "", "startMonth": "", "startYear": "", "endMonth": "", "endYear": "", "current": false, "gpa": "" }]
}

RESUME DOCUMENT:
${document}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Optional string fields are checked as "absent or a string" rather than
// required, since the prompt tells the model to omit what the document
// doesn't say.
function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

/**
 * Keeps the well-formed typo notes and drops the rest. A malformed list is ignored, never an error.
 * In plain terms: takes the AI's typo list and keeps only the entries that make sense.
 */
export function cleanSpelling(value: unknown): SpellingNote[] {
  if (!Array.isArray(value)) return [];
  const notes: SpellingNote[] = [];
  for (const item of value) {
    if (!isObject(item) || typeof item.text !== 'string' || typeof item.suggestion !== 'string') continue;
    const text = item.text.trim();
    const suggestion = item.suggestion.trim();
    if (text && suggestion && text !== suggestion) notes.push({ text, suggestion });
  }
  return notes;
}

/**
 * Structural check on the extractor's reply. Element types are checked (not
 * just Array.isArray) so a malformed shape is rejected and retried by
 * generateStructured rather than reaching the review screen half-broken.
 * In plain terms: makes sure the AI's answer has the right shape before we
 * show it to you.
 */
export function isExtractedProfile(value: unknown): value is ExtractedProfile {
  if (!isObject(value)) return false;

  if (!optionalString(value.summary)) return false;

  if (!isObject(value.contact)) return false;
  const contact = value.contact;
  if (
    !optionalString(contact.name) ||
    !optionalString(contact.email) ||
    !optionalString(contact.phone) ||
    !optionalString(contact.location) ||
    !(contact.links === undefined || contact.links === null || isStringArray(contact.links))
  ) {
    return false;
  }

  if (!Array.isArray(value.skills)) return false;
  for (const group of value.skills) {
    if (!isObject(group)) return false;
    if (typeof group.category !== 'string') return false;
    if (!isStringArray(group.items)) return false;
  }

  if (!Array.isArray(value.experience)) return false;
  for (const entry of value.experience) {
    if (!isObject(entry)) return false;
    if (typeof entry.company !== 'string' || typeof entry.title !== 'string') return false;
    if (!isStringArray(entry.bullets)) return false;
  }

  if (!Array.isArray(value.projects)) return false;
  for (const entry of value.projects) {
    if (!isObject(entry)) return false;
    if (typeof entry.name !== 'string') return false;
    if (!isStringArray(entry.bullets)) return false;
  }

  if (!Array.isArray(value.education)) return false;
  for (const entry of value.education) {
    if (!isObject(entry)) return false;
    if (typeof entry.school !== 'string' || typeof entry.degree !== 'string') return false;
  }

  return true;
}
