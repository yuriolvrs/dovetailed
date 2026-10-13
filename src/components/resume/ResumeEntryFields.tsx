// What this file is: the small title-and-dates forms that open under a
// resume entry's heading (the pencil button): role, company, location,
// dates and section for a job; name and one-line description for a project.
// In plain terms: where you fix a job's title or dates on this resume.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ExperienceEntry, ProjectEntry } from '../../types';
import { DateRangeCompact } from '../profile/DateRangeFields';
import { fieldInputClass, fieldLabelClass } from '../ui/primitives';

const NEW_SECTION_OPTION = '__new__';

/**
 * A labelled field: the label above whatever control is passed in.
 * In plain terms: one box in the form, with its name above it.
 */
function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
    </label>
  );
}

/**
 * A job's heading fields. Changing the section moves the entry, so it goes
 * through onSectionChange rather than onChange.
 * In plain terms: the form for a job's title, company, place, dates and heading.
 */
export function ExperienceFields({
  entry,
  onChange,
  sections,
  onSectionChange,
  autoFocus = false,
}: {
  entry: ExperienceEntry;
  onChange: (next: ExperienceEntry) => void;
  sections: string[];
  onSectionChange: (label: string) => void;
  autoFocus?: boolean;
}) {
  const [namingSection, setNamingSection] = useState(false);
  const current = entry.section?.trim() || sections[0] || 'Experience';
  const options = sections.includes(current) ? sections : [current, ...sections];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Role">
        <input
          autoFocus={autoFocus}
          className={fieldInputClass}
          value={entry.title}
          placeholder="Job title"
          onChange={(e) => onChange({ ...entry, title: e.target.value })}
        />
      </Field>
      <Field label="Company">
        <input
          className={fieldInputClass}
          value={entry.company}
          placeholder="Company or organization"
          onChange={(e) => onChange({ ...entry, company: e.target.value })}
        />
      </Field>
      <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
        <span className={fieldLabelClass}>Dates</span>
        <DateRangeCompact entry={entry} update={onChange} currentLabel="Still here" />
      </div>
      <Field label="Location">
        <input
          className={fieldInputClass}
          value={entry.location ?? ''}
          placeholder="City, or Remote"
          onChange={(e) => onChange({ ...entry, location: e.target.value })}
        />
      </Field>
      <Field label="Resume heading">
        {namingSection ? (
          <input
            autoFocus
            defaultValue=""
            placeholder="Heading name, then Enter"
            onBlur={() => setNamingSection(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNamingSection(false);
              if (e.key !== 'Enter') return;
              const label = e.currentTarget.value.trim();
              if (label) onSectionChange(label);
              setNamingSection(false);
            }}
            className={fieldInputClass}
          />
        ) : (
          <select
            value={current}
            onChange={(e) => {
              if (e.target.value === NEW_SECTION_OPTION) setNamingSection(true);
              else onSectionChange(e.target.value);
            }}
            className={fieldInputClass}
          >
            {options.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
            <option value={NEW_SECTION_OPTION}>New heading…</option>
          </select>
        )}
      </Field>
    </div>
  );
}

/**
 * A project's heading fields.
 * In plain terms: the form for a project's name and one-line description.
 */
export function ProjectFields({
  entry,
  onChange,
  autoFocus = false,
}: {
  entry: ProjectEntry;
  onChange: (next: ProjectEntry) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <Field label="Project name">
        <input
          autoFocus={autoFocus}
          className={fieldInputClass}
          value={entry.name}
          placeholder="Project name"
          onChange={(e) => onChange({ ...entry, name: e.target.value })}
        />
      </Field>
      <Field label="Description">
        <input
          className={fieldInputClass}
          value={entry.description}
          placeholder="What it is, in one line"
          onChange={(e) => onChange({ ...entry, description: e.target.value })}
        />
      </Field>
    </div>
  );
}
