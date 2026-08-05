// What this file is: stable identity keys for resume experience/project/
// education entries (shared by ResumeEditor, ResumePrintView, and
// GeneratePage), the type describing which resume field is currently
// focused so the live preview can highlight the matching spot (editor ->
// preview), and ResumeNavTarget, the reverse: which editor field a click in
// the preview should scroll to and open (preview -> editor).
// In plain terms: a way to say "this bullet in the editor is the same one as
// this bullet in the preview" even after entries get reordered or dropped,
// used both to highlight the preview while editing and to jump to a field
// in the editor when you click it in the preview.

import type { EducationEntry, ExperienceEntry, ProjectEntry } from '../types';

// Identifies an experience entry by the fields a resume-editor copy can't
// change (company/title/dates), since content.experience doesn't line up by
// index with profile.experience once entries are reordered or dropped.
export function experienceKey(entry: ExperienceEntry): string {
  return [entry.company, entry.title, entry.startMonth, entry.startYear, entry.endMonth, entry.endYear].join('|');
}

export function projectKey(entry: ProjectEntry): string {
  return [entry.name, entry.description].join('|');
}

export function educationKey(entry: EducationEntry): string {
  return [entry.school, entry.degree, entry.startMonth, entry.startYear, entry.endMonth, entry.endYear].join('|');
}

export type ResumeFocusTarget =
  | { section: 'experience'; entryKey: string; bulletIndex: number }
  | { section: 'project'; entryKey: string; bulletIndex: number };

// A one-shot "scroll to and open this" request fired by clicking something
// in the live preview; GeneratePage wraps it with a nonce (see navRequest
// state) so the same target can be re-requested by clicking it again.
export type ResumeNavTarget =
  | { section: 'contact' }
  | { section: 'education'; entryKey: string }
  | { section: 'experience'; entryKey: string; bulletIndex?: number }
  | { section: 'project'; entryKey: string; bulletIndex?: number }
  | { section: 'skills'; groupIndex: number };
