// What this file is: the editable form for the Experience section — a list
// of jobs, each with company/title/dates/location and a list of resume
// bullets.
// In plain terms: the form where you list your past jobs and what you did
// at each one.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ExperienceEntry } from '../../types';
import { EditableList } from '../EditableList';
import { StringList } from '../StringList';
import { DateRangeFields } from './DateRangeFields';
import {
  Card,
  Collapsible,
  CollapsibleSectionHeader,
  FieldInput,
  fieldLabelClass,
} from '../ui/primitives';

function newExperienceEntry(): ExperienceEntry {
  return { section: 'Experience', company: '', title: '', current: false, bullets: [] };
}

export function ExperienceForm({
  value,
  onChange,
  bulletBadge,
  bulletRewrite,
}: {
  value: ExperienceEntry[];
  onChange: (experience: ExperienceEntry[]) => void;
  /** Optional per-bullet extra content (e.g. an "unevidenced" warning badge) -- used by ResumeEditor, unused on the Profile page. */
  bulletBadge?: (bulletText: string) => ReactNode;
  /** Optional per-bullet "suggest a rewording" action -- used by ResumeEditor, unused on the Profile page. */
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card className="p-6">
      <CollapsibleSectionHeader
        title="Work Experience"
        sub={`${value.length} position${value.length !== 1 ? 's' : ''}`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onAdd={() => onChange([...value, newExperienceEntry()])}
        addLabel="Add"
      />
      <Collapsible open={open}>
        <EditableList<ExperienceEntry>
          items={value}
          onChange={onChange}
          newItem={newExperienceEntry}
          emptyLabel="No experience entries yet."
          hideAddButton
          renderItem={(entry, update) => (
            <div className="space-y-3">
              <FieldInput
                label="Section"
                placeholder="Experience"
                value={entry.section ?? ''}
                onChange={(section) => update({ ...entry, section })}
              />

              <div className="grid grid-cols-2 gap-3">
                <FieldInput
                  label="Company"
                  placeholder="Stripe"
                  value={entry.company}
                  onChange={(company) => update({ ...entry, company })}
                />
                <FieldInput
                  label="Job Title"
                  placeholder="Senior Engineer"
                  value={entry.title}
                  onChange={(title) => update({ ...entry, title })}
                />
              </div>

              <DateRangeFields entry={entry} update={update} currentLabel="Currently working here" />

              <FieldInput
                label="Location"
                placeholder="San Francisco, CA"
                value={entry.location ?? ''}
                onChange={(location) => update({ ...entry, location })}
              />

              <div>
                <span className={`mb-1 block ${fieldLabelClass}`}>Description & Achievements</span>
                <StringList
                  items={entry.bullets}
                  onChange={(bullets) => update({ ...entry, bullets })}
                  placeholder="Describe an accomplishment..."
                  multiline
                  addLabel="Add bullet"
                  emptyLabel="No bullets yet."
                  itemBadge={bulletBadge}
                  itemExtra={bulletRewrite}
                />
              </div>
            </div>
          )}
        />
      </Collapsible>
    </Card>
  );
}
