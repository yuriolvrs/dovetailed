// What this file is: the Education tab -- a rail listing every school next
// to a detail pane for the one that's selected, so the list stays visible
// while you edit one entry. Same shell, rail and pane shape as the
// Experience tab; only the fields differ.
// In plain terms: the screen where you list your schools and degrees.

import type { EducationEntry } from '../../types';
import { EntryEditor } from './EntryEditor';
import { EducationDetail } from './EducationDetail';
import { formatMonthYear } from '../ui/primitives';

function newEducationEntry(): EducationEntry {
  return { school: '', degree: '', current: false };
}

/**
 * One school's date range as a single line, e.g. "Aug 2022 – Present".
 * In plain terms: the short "from – to" text under a school in the list.
 */
function dateSummary(entry: EducationEntry): string {
  const start = formatMonthYear(entry.startMonth, entry.startYear);
  const end = entry.current ? 'Present' : formatMonthYear(entry.endMonth, entry.endYear);
  if (!start && !end) return '';
  return `${start || '?'} – ${end || '?'}`;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function EducationForm({
  value,
  onChange,
}: {
  value: EducationEntry[];
  onChange: (education: EducationEntry[]) => void;
}) {
  const detailTotal = value.reduce((total, entry) => total + (entry.details?.length ?? 0), 0);

  return (
    <EntryEditor<EducationEntry>
      title="Education"
      sub={`${count(value.length, 'school')} · ${count(detailTotal, 'detail')}`}
      items={value}
      onChange={onChange}
      newItem={newEducationEntry}
      duplicate={(entry) => ({ ...entry, details: [...(entry.details ?? [])] })}
      addLabel="Add school"
      emptyLabel="No education entries yet."
      searchPlaceholder="Find a school"
      searchFields={(entry) => [entry.school, entry.degree, entry.field]}
      row={(entry) => ({
        title: entry.school,
        untitled: 'Untitled school',
        subtitle: [entry.degree.trim(), dateSummary(entry)].filter(Boolean).join(' · '),
        emptySubtitle: 'No details yet',
        meta: (entry.details?.length ?? 0) > 0 && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {entry.details?.length}
          </span>
        ),
      })}
      renderDetail={({ entry, update, onDuplicate, onDelete }) => (
        <EducationDetail
          entry={entry}
          onChange={update}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      )}
    />
  );
}
