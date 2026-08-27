// What this file is: the Education editor's right pane -- the one school
// selected in the rail: its institution/degree headline, the dates, field of
// study and GPA, and its list of details. Same pane shape as
// ExperienceDetail, built from the same EntryDetailFrame pieces.
// In plain terms: the form for the school you picked in the sidebar.

import type { EducationEntry } from '../../types';
import { StringList } from '../StringList';
import { DateRangeCompact } from './DateRangeFields';
import {
  EntryDetailField,
  EntryDetailFields,
  EntryDetailHeader,
  EntryDetailListHeader,
} from './EntryDetailFrame';
import { FieldInput } from '../ui/primitives';

export function EducationDetail({
  entry,
  onChange,
  onDuplicate,
  onDelete,
}: {
  entry: EducationEntry;
  onChange: (next: EducationEntry) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const details = entry.details ?? [];

  return (
    <div className="flex flex-col">
      <EntryDetailHeader
        title={entry.school}
        titlePlaceholder="Institution"
        onTitleChange={(school) => onChange({ ...entry, school })}
        subtitle={entry.degree}
        subtitlePlaceholder="Degree"
        onSubtitleChange={(degree) => onChange({ ...entry, degree })}
        noun="school"
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />

      <EntryDetailFields>
        <EntryDetailField label="Dates">
          <DateRangeCompact entry={entry} update={onChange} currentLabel="Still studying" />
        </EntryDetailField>

        <FieldInput
          label="Field of study"
          placeholder="Computer Science"
          value={entry.field ?? ''}
          onChange={(field) => onChange({ ...entry, field })}
        />

        <FieldInput
          label="GPA"
          placeholder="3.8"
          value={entry.gpa ?? ''}
          onChange={(gpa) => onChange({ ...entry, gpa })}
        />
      </EntryDetailFields>

      <div className="p-5">
        <EntryDetailListHeader
          label="Details"
          count={details.length}
          addLabel="Add detail"
          onAdd={() => onChange({ ...entry, details: [...details, ''] })}
        />
        <StringList
          items={details}
          onChange={(next) => onChange({ ...entry, details: next })}
          placeholder="e.g. Dean's List, relevant coursework..."
          multiline
          variant="flat"
          hideAddButton
          emptyLabel="No details yet."
          reorderable
        />
      </div>
    </div>
  );
}
