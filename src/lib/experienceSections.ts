// What this file is: pure helpers for the Experience list's section
// grouping -- reading an entry's section label, grouping entries under it,
// keeping each section's entries contiguous in the stored array, and moving
// an entry between sections/positions.
// In plain terms: the logic behind grouping your jobs under headings like
// "Work Experience" or "Volunteering", and moving a job from one to another.

import type { ExperienceEntry } from '../types';

/** Heading an entry falls under when it has no section of its own -- matches ExperienceEntry.section's documented fallback. */
export const DEFAULT_SECTION = 'Experience';

/**
 * The heading an entry belongs to: its own `section`, trimmed, or the
 * default when it has none.
 * In plain terms: which group heading this job shows up under.
 */
export function sectionOf(entry: ExperienceEntry): string {
  const label = entry.section?.trim();
  return label ? label : DEFAULT_SECTION;
}

export interface SectionGroup {
  label: string;
  /** Entries in this section, each with its index in the original array. */
  items: { entry: ExperienceEntry; index: number }[];
}

/**
 * Groups entries by section heading, in the order the headings first appear.
 * Entries with the same heading are collected together even if they aren't
 * adjacent in the array, so the list never shows the same heading twice.
 * In plain terms: sorts your jobs into their headings for the sidebar list.
 */
export function groupBySection(entries: ExperienceEntry[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  const byLabel = new Map<string, SectionGroup>();

  entries.forEach((entry, index) => {
    const label = sectionOf(entry);
    let group = byLabel.get(label);
    if (!group) {
      group = { label, items: [] };
      byLabel.set(label, group);
      groups.push(group);
    }
    group.items.push({ entry, index });
  });

  return groups;
}

/**
 * The section headings present, in the order they first appear.
 * In plain terms: the list of headings, top to bottom.
 */
export function sectionOrder(entries: ExperienceEntry[]): string[] {
  return groupBySection(entries).map((group) => group.label);
}

/**
 * Reorders entries so every section's entries sit together, entries keeping
 * their relative order within a section. Stored order is what a generated
 * resume prints, so a section has to be contiguous to render as one block.
 * `preferredOrder` (normally the headings as they stood *before* an edit)
 * pins the heading sequence, so relabelling one entry can't make its new
 * section jump to the top of the list.
 * In plain terms: keeps all the jobs under one heading next to each other,
 * without shuffling the headings themselves.
 */
export function normalizeSections(
  entries: ExperienceEntry[],
  preferredOrder: string[] = [],
): ExperienceEntry[] {
  const groups = groupBySection(entries);
  const byLabel = new Map(groups.map((group) => [group.label, group]));
  const seen = new Set<string>();

  return [...preferredOrder, ...groups.map((group) => group.label)].flatMap((label) => {
    const group = byLabel.get(label);
    if (!group || seen.has(label)) return [];
    seen.add(label);
    return group.items.map((item) => item.entry);
  });
}

/**
 * Moves the entry at `from` so it sits before the entry at `to`, puts it in
 * `label`'s section, and re-groups. Returns the new array plus where the
 * moved entry ended up, so the caller can keep it selected.
 * In plain terms: what happens when you drag a job to a new spot, possibly
 * under a different heading.
 */
export function moveEntryToSection(
  entries: ExperienceEntry[],
  from: number,
  to: number,
  label: string,
): { entries: ExperienceEntry[]; index: number } {
  const rest = entries.slice();
  const [moved] = rest.splice(from, 1);
  const relabelled = { ...moved, section: label };
  rest.splice(from < to ? to - 1 : to, 0, relabelled);

  const next = normalizeSections(rest, sectionOrder(entries));
  return { entries: next, index: next.indexOf(relabelled) };
}

/**
 * Appends a new entry to the end of `label`'s section. Returns the new array
 * plus the new entry's index, so the caller can select and focus it.
 * In plain terms: adds a blank job under the heading you clicked "+" on.
 */
export function addEntryToSection(
  entries: ExperienceEntry[],
  label: string,
  newEntry: () => ExperienceEntry,
): { entries: ExperienceEntry[]; index: number } {
  const added = { ...newEntry(), section: label };
  const next = normalizeSections([...entries, added], sectionOrder(entries));
  return { entries: next, index: next.indexOf(added) };
}

/**
 * Puts one entry in a different section and re-groups. Returns the new array
 * plus the entry's new index.
 * In plain terms: what happens when you pick a different heading for a job.
 */
export function setEntrySection(
  entries: ExperienceEntry[],
  index: number,
  label: string,
): { entries: ExperienceEntry[]; index: number } {
  const relabelled = { ...entries[index], section: label };
  const swapped = entries.map((entry, i) => (i === index ? relabelled : entry));
  const next = normalizeSections(swapped, sectionOrder(entries));
  return { entries: next, index: next.indexOf(relabelled) };
}
