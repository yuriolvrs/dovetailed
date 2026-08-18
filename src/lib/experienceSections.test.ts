// What this file is: unit tests for the Experience list's section grouping --
// the default heading fallback, grouping order, keeping a section's entries
// contiguous, and the index a moved/added entry ends up at.
// In plain terms: tests proving jobs land under the right heading, in the
// right order, when you drag them around or add one.

import { describe, expect, it } from 'vitest';
import type { ExperienceEntry } from '../types';
import {
  DEFAULT_SECTION,
  addEntryToSection,
  groupBySection,
  moveEntryToSection,
  normalizeSections,
  sectionOf,
  setEntrySection,
} from './experienceSections';

function exp(title: string, section?: string): ExperienceEntry {
  return { company: 'Co', title, current: false, bullets: [], ...(section === undefined ? {} : { section }) };
}

const titles = (entries: ExperienceEntry[]) => entries.map((e) => e.title);

describe('sectionOf', () => {
  it('falls back to the default heading when there is no section', () => {
    expect(sectionOf(exp('A'))).toBe(DEFAULT_SECTION);
    expect(sectionOf(exp('A', '   '))).toBe(DEFAULT_SECTION);
  });

  it('trims the entry\'s own section', () => {
    expect(sectionOf(exp('A', '  Volunteering '))).toBe('Volunteering');
  });
});

describe('groupBySection', () => {
  it('orders groups by first appearance and keeps each entry\'s index', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Volunteering'), exp('C', 'Work')];
    const groups = groupBySection(entries);

    expect(groups.map((g) => g.label)).toEqual(['Work', 'Volunteering']);
    expect(groups[0].items.map((i) => i.index)).toEqual([0, 2]);
    expect(groups[1].items.map((i) => i.index)).toEqual([1]);
  });

  it('collects entries with no section under the default heading', () => {
    expect(groupBySection([exp('A'), exp('B', 'Experience')]).map((g) => g.label)).toEqual([
      DEFAULT_SECTION,
    ]);
  });
});

describe('normalizeSections', () => {
  it('makes each section contiguous without reordering within it', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Volunteering'), exp('C', 'Work')];
    expect(titles(normalizeSections(entries))).toEqual(['A', 'C', 'B']);
  });

  it('leaves an already-grouped list alone', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Work'), exp('C', 'Volunteering')];
    expect(titles(normalizeSections(entries))).toEqual(['A', 'B', 'C']);
  });
});

describe('moveEntryToSection', () => {
  it('moves an entry down within its own section', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Work'), exp('C', 'Work')];
    const result = moveEntryToSection(entries, 0, 2, 'Work');

    expect(titles(result.entries)).toEqual(['B', 'A', 'C']);
    expect(result.index).toBe(1);
  });

  it('moves an entry up within its own section', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Work'), exp('C', 'Work')];
    const result = moveEntryToSection(entries, 2, 0, 'Work');

    expect(titles(result.entries)).toEqual(['C', 'A', 'B']);
    expect(result.index).toBe(0);
  });

  it('relabels the entry when it is dropped into another section', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Work'), exp('C', 'Volunteering')];
    const result = moveEntryToSection(entries, 0, 2, 'Volunteering');

    expect(titles(result.entries)).toEqual(['B', 'A', 'C']);
    expect(result.entries[1].section).toBe('Volunteering');
    expect(result.index).toBe(1);
  });

  it('does not mutate the original array', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Work')];
    moveEntryToSection(entries, 0, 2, 'Work');
    expect(titles(entries)).toEqual(['A', 'B']);
  });
});

describe('addEntryToSection', () => {
  it('appends to the end of the named section and reports its index', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Volunteering')];
    const result = addEntryToSection(entries, 'Work', () => exp(''));

    expect(titles(result.entries)).toEqual(['A', '', 'B']);
    expect(result.index).toBe(1);
    expect(result.entries[1].section).toBe('Work');
  });

  it('starts a new section at the end of the list', () => {
    const entries = [exp('A', 'Work')];
    const result = addEntryToSection(entries, 'Certifications', () => exp(''));

    expect(result.index).toBe(1);
    expect(result.entries[1].section).toBe('Certifications');
  });
});

describe('setEntrySection', () => {
  it('moves the entry to its new section and reports its index', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Work'), exp('C', 'Volunteering')];
    const result = setEntrySection(entries, 0, 'Volunteering');

    expect(titles(result.entries)).toEqual(['B', 'A', 'C']);
    expect(result.index).toBe(1);
  });

  it('keeps the list unchanged when the section is the same', () => {
    const entries = [exp('A', 'Work'), exp('B', 'Work')];
    const result = setEntrySection(entries, 1, 'Work');

    expect(titles(result.entries)).toEqual(['A', 'B']);
    expect(result.index).toBe(1);
  });
});
