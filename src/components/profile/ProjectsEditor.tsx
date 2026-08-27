// What this file is: the Projects tab on the Profile page -- a rail listing
// every project next to a detail pane for the one that's selected. Same
// shell, rail and pane shape as the Experience and Education tabs; only the
// fields differ.
// The resume editor keeps its own ProjectsForm, where every project is
// expanded at once: that screen's task is choosing what goes in one resume,
// not maintaining the profile.
// In plain terms: the screen where you list the projects you've built.

import type { ReactNode } from 'react';
import type { ProjectEntry } from '../../types';
import { EntryEditor } from './EntryEditor';
import { ProjectDetail } from './ProjectDetail';

function newProjectEntry(): ProjectEntry {
  return { name: '', description: '', bullets: [], links: [] };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function ProjectsEditor({
  value,
  onChange,
  bulletBadge,
  bulletRewrite,
}: {
  value: ProjectEntry[];
  onChange: (projects: ProjectEntry[]) => void;
  bulletBadge?: (bulletText: string) => ReactNode;
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
}) {
  const bulletTotal = value.reduce((total, entry) => total + entry.bullets.length, 0);

  return (
    <EntryEditor<ProjectEntry>
      title="Projects"
      sub={`${count(value.length, 'project')} · ${count(bulletTotal, 'bullet')}`}
      items={value}
      onChange={onChange}
      newItem={newProjectEntry}
      duplicate={(entry) => ({
        ...entry,
        bullets: [...entry.bullets],
        links: entry.links.map((link) => ({ ...link })),
      })}
      addLabel="Add project"
      emptyLabel="No projects yet."
      searchPlaceholder="Find a project"
      searchFields={(entry) => [entry.name, entry.description]}
      row={(entry) => ({
        title: entry.name,
        untitled: 'Untitled project',
        subtitle: entry.description.trim(),
        emptySubtitle: 'No description yet',
        meta: entry.bullets.length > 0 && (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {entry.bullets.length}
          </span>
        ),
      })}
      renderDetail={({ entry, update, onDuplicate, onDelete }) => (
        <ProjectDetail
          entry={entry}
          onChange={update}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          bulletBadge={bulletBadge}
          bulletRewrite={bulletRewrite}
        />
      )}
    />
  );
}
