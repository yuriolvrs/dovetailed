// What this file is: the editor for one project, opened in place on the
// Profile page and in the resume editor: its name/description headline, its
// links, and its list of bullets. Same pane shape as ExperienceDetail and
// EducationDetail, built from the same EntryDetailFrame pieces.
// In plain terms: the form for the project you clicked.

import type { ContactLink, ProjectEntry } from '../../types';
import type { ReactNode } from 'react';
import { EditableList } from '../EditableList';
import { focusLastQuickEntry, StringList } from '../StringList';
import {
  EntryDetailFields,
  EntryDetailField,
  EntryDetailHeader,
  EntryDetailListHeader,
  EntryMoreDetails,
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
  noun,
  belowBullets,
  onBulletFocus,
  onBulletBlur,
}: {
  entry: ProjectEntry;
  onChange: (next: ProjectEntry) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  bulletBadge?: (bulletText: string) => ReactNode;
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
  autoFocus?: boolean;
  onFocused?: () => void;
  /** What the delete confirm calls this entry; defaults to the profile wording. */
  noun?: string;
  /** Shown under the bullets, e.g. the resume editor's "Not included" picker. */
  belowBullets?: ReactNode;
  /** Bullet focus and blur, so a live preview can highlight the bullet being edited. */
  onBulletFocus?: (bulletIndex: number) => void;
  onBulletBlur?: () => void;
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
        noun={noun ?? "project"}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        autoFocus={autoFocus}
        onFocused={onFocused}
      />

      <div className="p-5">
        <EntryDetailListHeader
          label="Highlights"
          count={entry.bullets.length}
          addLabel="Add highlight"
          onAdd={() => {
            onChange({ ...entry, bullets: [...entry.bullets, ''] });
            focusLastQuickEntry();
          }}
        />
        <StringList
          // An entry with no bullets still shows one field, so you can start
          // typing or paste a list straight away. Nothing is saved until you do.
          items={entry.bullets.length > 0 ? entry.bullets : ['']}
          onChange={(bullets) => onChange({ ...entry, bullets })}
          placeholder={
            entry.bullets.length > 0
              ? 'Describe an accomplishment (Enter adds the next one)'
              : 'What did you do here? Type one accomplishment, or paste a list (one per line).'
          }
          multiline
          variant="flat"
          hideAddButton
          quickEntry
          reorderable
          itemBadge={bulletBadge}
          itemExtra={bulletRewrite}
          onItemFocus={onBulletFocus}
          onItemBlur={onBulletBlur}
        />
        {belowBullets && <div className="mt-3">{belowBullets}</div>}
      </div>

      <EntryMoreDetails summary="Links">
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
      </EntryMoreDetails>
    </div>
  );
}
