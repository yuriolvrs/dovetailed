// What this file is: stable identity keys for resume experience/project
// entries (shared by ResumeEditor, ResumePrintView, and GeneratePage), plus
// the type describing which resume field is currently focused so the live
// preview can highlight the matching spot.
// In plain terms: a way to say "this bullet in the editor is the same one as
// this bullet in the preview" even after entries get reordered or dropped.

import type { ExperienceEntry, ProjectEntry } from '../types';

// Identifies an experience entry by the fields a resume-editor copy can't
// change (company/title/dates), since content.experience doesn't line up by
// index with profile.experience once entries are reordered or dropped.
export function experienceKey(entry: ExperienceEntry): string {
  return [entry.company, entry.title, entry.startMonth, entry.startYear, entry.endMonth, entry.endYear].join('|');
}

export function projectKey(entry: ProjectEntry): string {
  return [entry.name, entry.description].join('|');
}

export type ResumeFocusTarget =
  | { section: 'experience'; entryKey: string; bulletIndex: number }
  | { section: 'project'; entryKey: string; bulletIndex: number };
