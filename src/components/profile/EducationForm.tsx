// What this file is: the editable form for the Education section — a list
// of schools/degrees with optional extra details.
// In plain terms: the form where you list your schools and degrees.

import { useState } from 'react';
import type { EducationEntry } from '../../types';
import { EditableList } from '../EditableList';
import { StringList } from '../StringList';
import { DateRangeFields } from './DateRangeFields';
import { Card, Collapsible, CollapsibleSectionHeader, FieldInput, fieldLabelClass } from '../ui/primitives';

function newEducationEntry(): EducationEntry {
  return { school: '', degree: '', current: false };
}

export function EducationForm({
  value,
  onChange,
}: {
  value: EducationEntry[];
  onChange: (education: EducationEntry[]) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card className="p-6">
      <CollapsibleSectionHeader
        title="Education"
        sub={`${value.length} entr${value.length !== 1 ? 'ies' : 'y'}`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onAdd={() => onChange([...value, newEducationEntry()])}
        addLabel="Add"
      />
      <Collapsible open={open}>
        <EditableList<EducationEntry>
          items={value}
          onChange={onChange}
          newItem={newEducationEntry}
          emptyLabel="No education entries yet."
          hideAddButton
          renderItem={(entry, update) => (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <FieldInput
                    label="Institution"
                    placeholder="UC Berkeley"
                    value={entry.school}
                    onChange={(school) => update({ ...entry, school })}
                  />
                </div>
                <FieldInput
                  label="Degree"
                  placeholder="B.S."
                  value={entry.degree}
                  onChange={(degree) => update({ ...entry, degree })}
                />
                <FieldInput
                  label="Field of Study"
                  placeholder="Computer Science"
                  value={entry.field ?? ''}
                  onChange={(field) => update({ ...entry, field })}
                />
              </div>

              <DateRangeFields entry={entry} update={update} currentLabel="Currently studying here" />

              <FieldInput
                label="GPA"
                placeholder="3.8"
                value={entry.gpa ?? ''}
                onChange={(gpa) => update({ ...entry, gpa })}
                className="max-w-[140px]"
              />

              <div>
                <span className={`mb-1 block ${fieldLabelClass}`}>Details</span>
                <StringList
                  items={entry.details ?? []}
                  onChange={(details) => update({ ...entry, details })}
                  placeholder="e.g. Dean's List, relevant coursework..."
                  addLabel="Add detail"
                  emptyLabel="No details yet."
                />
              </div>
            </div>
          )}
        />
      </Collapsible>
    </Card>
  );
}
