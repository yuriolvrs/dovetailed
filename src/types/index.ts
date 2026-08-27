// What this file is: the TypeScript types for every piece of data the app
// works with (profile, job postings, generated documents, LaTeX templates).
// This is the single source of truth — Dexie tables (src/lib/db.ts) and
// future LLM prompts (src/prompts/) derive from these shapes. Transcribed
// from PRD.md §6; keep this file authoritative, don't redefine these shapes
// elsewhere.
// In plain terms: this is the blueprint describing what a "profile," a
// "job posting," and a "generated resume" look like as data.

/** Bump when the persisted shape changes; used for export/import migrations. */
export const SCHEMA_VERSION = 4;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface ContactLink {
  label: string;
  url: string;
}

export interface Contact {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  links: ContactLink[];
}

export interface ExperienceEntry {
  /** User-defined group heading for the resume (e.g. "Work Experience", "Extra-Curricular Activities"). Empty/unset falls back to "Experience". */
  section?: string;
  company: string;
  title: string;
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  /** When true, this is the current position; end date is ignored/cleared. */
  current: boolean;
  location?: string;
  bullets: string[];
  /** When true, this entry is dropped first (oldest first) if a generated resume runs past one page. */
  prunable?: boolean;
}

export interface ProjectEntry {
  name: string;
  description: string;
  bullets: string[];
  links: ContactLink[];
}

export interface EducationEntry {
  school: string;
  degree: string;
  field?: string;
  startMonth?: string;
  startYear?: string;
  endMonth?: string;
  endYear?: string;
  /** When true, still studying here; end date is ignored/cleared. */
  current: boolean;
  gpa?: string;
  details?: string[];
}

/** A named group of skills, e.g. { category: "Languages", items: ["Java", "Python"] }. */
export interface SkillGroup {
  category: string;
  items: string[];
}

export interface Profile {
  /** Single local profile in v1; fixed id keeps the row addressable. */
  id: string;
  contact: Contact;
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  /** Free-text samples used for cover-letter style mimicry. */
  writingSamples: string[];
  /**
   * Resume-worthy accomplishments not tied to any specific experience/project
   * entry -- entered from the job-matching screen, but stored on the profile
   * so they're available as evidence in every future matching pass.
   */
  additionalInfo: string[];
}

// ---------------------------------------------------------------------------
// Profile atoms (indexed profile content for matching)
// ---------------------------------------------------------------------------

/** One discrete, quotable unit of profile content -- a skill, a bullet, etc. */
export interface ProfileAtom {
  /** Content-derived; stable across re-derivation as long as the text is unchanged. */
  id: string;
  source: 'skills' | 'experience' | 'projects' | 'education' | 'additional';
  /** e.g. "Experience: Software Engineering Intern, Acme Co" */
  sourceLabel: string;
  /** Verbatim text from the profile. */
  text: string;
}

// ---------------------------------------------------------------------------
// Job posting + analysis
// ---------------------------------------------------------------------------

export type RequirementSeverity = 'required' | 'preferred';

export interface Requirement {
  id: string;
  text: string;
  severity: RequirementSeverity;
  /** Position as it appeared in the posting text; used for display sort. */
  order: number;
}

export type MatchStatus = 'full' | 'partial' | 'gap_no_candidates' | 'gap_unverified';

export interface RequirementMatch {
  requirementId: string;
  status: MatchStatus;
  /** References into ProfileAtom -- never free text. */
  atomIds: string[];
  /**
   * Only set when status is 'gap_unverified': the candidate atoms retrieval
   * found for this requirement, none of which the LLM confirmed. Shown to
   * the user as "considered but not confirmed" so they can judge for
   * themselves and add one manually if they disagree with the LLM's call.
   */
  consideredAtomIds?: string[];
}

export interface JobAnalysis {
  roleSummary: string;
  requirements: Requirement[];
  keywords: string[];
  /** One entry per requirement, always present. */
  matches: RequirementMatch[];
}

// ---------------------------------------------------------------------------
// Holistic (direct) selection -- the alternate route to the same documents
// ---------------------------------------------------------------------------

/**
 * Which route produced a generation. 'matched' is the original pipeline
 * (posting -> extracted requirements -> per-requirement evidence matching);
 * 'holistic' is the direct route (posting -> one LLM call picks profile
 * evidence itself). Absent on anything saved before the holistic route
 * existed, which is why every field carrying it is optional and defaults to
 * 'matched'.
 */
export type GenerationStrategy = 'matched' | 'holistic';

/**
 * One group of chosen evidence plus the model's stated reason for choosing
 * it. `sourceLabel` matches ProfileAtom.sourceLabel, so a note lines up with
 * one job, project, or skill category.
 */
export interface HolisticGroupNote {
  sourceLabel: string;
  /**
   * Why this group was featured. Display-only, and deliberately so: free text
   * is the one field with nothing structurally constraining it to the truth
   * (see src/prompts/matchRequirement.ts's header for the fabrication this
   * caused when a note was previously fed back into matching). It is never
   * written into a document, never enters a sourceMap, and never exports.
   */
  note: string;
}

/**
 * The reasoning, in three separate parts. Separate FIELDS rather than one
 * string with paragraph breaks, because asking the model to format its own
 * prose does not work: told to write three blank-line-separated paragraphs it
 * returned a single unbroken block, so the structure has to be something it
 * fills in rather than something it punctuates. Display-only, all three --
 * see HolisticGroupNote.note.
 */
export interface HolisticRationale {
  /** What this posting asks for, in the posting's own words. */
  asks: string;
  /** What was chosen from the profile, and how it answers those asks. */
  chose: string;
  /** What was left out, and why it does not fit this posting. */
  leftOut: string;
}

/**
 * The result of one direct-selection pass over a posting: which profile atoms
 * the model chose to feature, and why. Stored on the posting rather than on a
 * generation because both the resume and the cover letter are built from the
 * same pass -- the exact role `analysis.matches` plays for the matched route.
 */
export interface HolisticSelection {
  createdAt: number;
  /** Ids of the chosen ProfileAtoms, most relevant first. Filtered against real atoms on receipt. */
  atomIds: string[];
  /** One or two sentences on the role, so the cover letter has the context the analysis pass would otherwise supply. */
  roleSummary: string;
  /** The three-part reasoning. Absent on selections saved before it was split -- see overallRationale. */
  rationale?: HolisticRationale;
  /**
   * The single-block reasoning used before the three-part split. Kept readable
   * rather than migrated: a stored selection is a record of one past pass, and
   * re-running is the way to get the new shape.
   */
  overallRationale?: string;
  /** Per-group reasons, one per featured job/project/skill category. Display-only. */
  groupNotes: HolisticGroupNote[];
}

/** Application-tracker status -- see STATUSES in jobStore.ts. Unset means not yet applied. */
export type ApplicationStatus = 'applied' | 'interviewing' | 'rejected' | 'offer';

export interface JobPosting {
  id: string;
  createdAt: number;
  title?: string;
  company?: string;
  location?: string;
  /** Work arrangement, e.g. "Onsite" | "Hybrid" | "Remote" -- see ARRANGEMENTS in jobStore.ts. */
  arrangement?: string;
  rawText: string;
  analysis?: JobAnalysis;
  /**
   * The direct route's evidence pass, if it has been run. Independent of
   * `analysis`: both may be present on one posting, which is what makes the
   * two routes comparable side by side on the same job.
   */
  holisticSelection?: HolisticSelection;
  /** Application-tracker status. Unset means not yet applied. */
  status?: ApplicationStatus;
  /** ms timestamp the status was last set to 'applied' -- shown as the applied date. */
  appliedAt?: number;
  /** ms timestamp of an application deadline, if any -- offered for .ics export. */
  deadline?: number;
}

// ---------------------------------------------------------------------------
// Generations (resume / cover letter)
// ---------------------------------------------------------------------------

export type GenerationType = 'resume' | 'coverLetter' | 'interviewPrep';

/**
 * Structured, field-editable resume content. Shape is deliberately minimal for
 * Phase 1; fleshed out in Phase 4 (resume generation).
 */
export interface ResumeContent {
  contact: Contact;
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
}

/**
 * Structured, field-editable cover-letter content. Minimal for Phase 1;
 * fleshed out in Phase 5 (cover letter).
 */
export interface CoverLetterContent {
  greeting: string;
  paragraphs: string[];
  closing: string;
}

/** One likely interview question, grounded in specific profile evidence via sourceMap (keyed by `question`). */
export interface InterviewQuestion {
  question: string;
  /** Why this question is likely, given the posting -- e.g. which requirement it probes. */
  rationale: string;
}

/**
 * Structured, field-editable interview-prep content -- a set of likely
 * interview questions, each backed by profile evidence (see sourceMap on the
 * Generation this is stored in, keyed the same way resume bullets are: one
 * entry per question's text).
 */
export interface InterviewPrepContent {
  questions: InterviewQuestion[];
}

/**
 * Marks one included resume item (a bullet or skill, copied verbatim from
 * the profile -- nothing here is generated text) as matched to this job's
 * requirements, referencing the ProfileAtom(s) it corresponds to. Used only
 * to show a "matched to this job" indicator in the editor; since resume
 * content is selected/reordered rather than generated, there is no
 * fabrication risk to trace here the way sourceMap once existed for.
 */
export interface SourceMapEntry {
  generatedText: string;
  atomIds: string[];
}

export interface Generation {
  id: string;
  jobPostingId: string;
  createdAt: number;
  type: GenerationType;
  /** Which route built this. Absent means 'matched' -- everything saved before the direct route existed. */
  strategy?: GenerationStrategy;
  content: ResumeContent | CoverLetterContent | InterviewPrepContent;
  sourceMap: SourceMapEntry[];
  /**
   * Whole experience entries page-fit trimming dropped when this was
   * generated, in removal order, so they stay offered for one-click restore
   * for as long as this generation exists -- not just until the page is
   * reloaded. Emptied as entries are restored.
   */
  removedForPageFit?: ExperienceEntry[];
  /** True when page-fit trimming ran out of allowed cuts and the resume is still over one page. */
  pageFitOverflow?: boolean;
}

/**
 * A past snapshot of a Generation, saved just before it's about to be
 * overwritten (regenerate, or restoring a different snapshot) so prior
 * versions aren't lost. Not itself editable -- restoring one copies its
 * content back into the current Generation.
 */
export interface GenerationSnapshot {
  id: string;
  jobPostingId: string;
  type: GenerationType;
  /** Mirrors Generation.strategy, so history stays separated per route. */
  strategy?: GenerationStrategy;
  createdAt: number;
  content: ResumeContent | CoverLetterContent | InterviewPrepContent;
  sourceMap: SourceMapEntry[];
}

// ---------------------------------------------------------------------------
// LaTeX templates
// ---------------------------------------------------------------------------

export interface LatexTemplate {
  id: string;
  name: string;
  /** As pasted by the user. */
  rawTex: string;
  /** Placeholder version, produced once by the LLM. */
  compiledTemplate: string;
  placeholders: string[];
}
