// What this file is: the Projects editor's right pane on the Profile page --
// the one project selected in the rail: its name/description headline, its
// links, and its list of bullets. Same pane shape as ExperienceDetail and
// EducationDetail, built from the same EntryDetailFrame pieces.
// (ProjectsForm.tsx is the different, all-entries-expanded projects editor
// the resume editor uses, where the task is curating one resume rather than
// maintaining the profile.)
// In plain terms: the form for the project you picked in the sidebar.

import type { ContactLink, ProjectEntry } from '../../types';
import type { ReactNode } from 'react';
import { EditableList } from '../EditableList';
import { StringList } from '../StringList';
import {
  EntryDetailFields,
  EntryDetailField,
  EntryDetailHeader,
  EntryDetailListHeader,
} from './EntryDetailFrame';
import { FieldInput } from '../ui/primitives';

/**
 * A permissive check: flags an obvious typo without refusing anything, since
 * the value is printed verbatim into a resume either way.
 * In plain terms: warns when a link doesn't look like a link.
 */
function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

export function ProjectDetail({
  entry,
  onChange,
  onDuplicate,
  onDelete,
  bulletBadge,
  bulletRewrite,
  autoFocus,
  onFocused,
}: {
  entry: ProjectEntry;
  onChange: (next: ProjectEntry) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  bulletBadge?: (bulletText: string) => ReactNode;
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
  autoFocus?: boolean;
  onFocused?: () => void;
}) {
  return (
    <div className="flex flex-col">
      <EntryDetailHeader
        title={entry.name}
        titlePlaceholder="Project name"
        onTitleChange={(name) => onChange({ ...entry, name })}
        subtitle={entry.description}
        subtitlePlaceholder="What it does, your role, and measurable impact"
        onSubtitleChange={(description) => onChange({ ...entry, description })}
        subtitleMultiline
        noun="project"
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        autoFocus={autoFocus}
        onFocused={onFocused}
      />

      <EntryDetailFields>
        <EntryDetailField label="Links" className="sm:col-span-2 xl:col-span-3">
          <EditableList<ContactLink>
            items={entry.links}
            onChange={(links) => onChange({ ...entry, links })}
            newItem={() => ({ label: '', url: '' })}
            addLabel="Add link"
            emptyLabel="No links yet."
            variant="flat"
            reorderable
            renderItem={(link, updateLink) => (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                <FieldInput
                  placeholder="Label (e.g. Demo)"
                  value={link.label}
                  onChange={(label) => updateLink({ ...link, label })}
                />
                <div>
                  <FieldInput
                    placeholder="https://..."
                    value={link.url}
                    onChange={(url) => updateLink({ ...link, url })}
                  />
                  {!looksLikeUrl(link.url) && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      Doesn't look like a web address — it will be printed as written.
                    </p>
                  )}
                </div>
              </div>
            )}
          />
        </EntryDetailField>
      </EntryDetailFields>

      <div className="p-5">
        <EntryDetailListHeader
          label="Highlights"
          count={entry.bullets.length}
          addLabel="Add highlight"
          onAdd={() => onChange({ ...entry, bullets: [...entry.bullets, ''] })}
        />
        <StringList
          items={entry.bullets}
          onChange={(bullets) => onChange({ ...entry, bullets })}
          placeholder="Describe an accomplishment..."
          multiline
          variant="flat"
          hideAddButton
          emptyLabel="No highlights yet."
          reorderable
          itemBadge={bulletBadge}
          itemExtra={bulletRewrite}
        />
      </div>
    </div>
  );
}
