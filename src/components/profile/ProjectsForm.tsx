// What this file is: the editable form for the Projects section — a list
// of projects, each with a name, description, bullets, and links.
// In plain terms: the form where you list personal or work projects you've
// built.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { ContactLink, ProjectEntry } from '../../types';
import { EditableList } from '../EditableList';
import { StringList } from '../StringList';
import { BulletPicker } from '../BulletPicker';
import {
  Card,
  Collapsible,
  CollapsibleSectionHeader,
  FieldInput,
  FieldTextarea,
  fieldLabelClass,
} from '../ui/primitives';

function newProjectEntry(): ProjectEntry {
  return { name: '', description: '', bullets: [], links: [] };
}

export function ProjectsForm({
  value,
  onChange,
  bulletBadge,
  bulletRewrite,
  bulletMatch,
  profileBulletsFor,
  excludedEntries,
  onAddEntry,
  onFocusBullet,
}: {
  value: ProjectEntry[];
  onChange: (projects: ProjectEntry[]) => void;
  /** Optional per-bullet extra content (e.g. an "unevidenced" warning badge) -- used by ResumeEditor, unused on the Profile page. */
  bulletBadge?: (bulletText: string) => ReactNode;
  /** Optional per-bullet "suggest a rewording" action -- used by ResumeEditor, unused on the Profile page. */
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
  /** Requirement text a bullet is matched to, or null -- used by ResumeEditor's "add back" picker, unused on the Profile page. */
  bulletMatch?: (bulletText: string) => string | null;
  /** All bullets on the matching source profile project (not just the ones currently included) -- used by ResumeEditor, unused on the Profile page. */
  profileBulletsFor?: (entry: ProjectEntry) => string[];
  /** Profile projects left out of this resume -- used by ResumeEditor's "add back" picker, unused on the Profile page. */
  excludedEntries?: ProjectEntry[];
  onAddEntry?: (entry: ProjectEntry) => void;
  /** Reports a bullet gaining focus (index) or losing it (null) -- used by ResumeEditor to highlight the live preview, unused on the Profile page. */
  onFocusBullet?: (entry: ProjectEntry, bulletIndex: number | null) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card className="p-6">
      <CollapsibleSectionHeader
        title="Projects"
        sub={`${value.length} project${value.length !== 1 ? 's' : ''}`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onAdd={() => onChange([...value, newProjectEntry()])}
        addLabel="Add"
      />
      <Collapsible open={open}>
        <EditableList<ProjectEntry>
          items={value}
          onChange={onChange}
          newItem={newProjectEntry}
          emptyLabel="No projects yet."
          hideAddButton
          reorderable
          renderItem={(entry, update) => (
            <div className="space-y-2">
              <FieldInput
                label="Project Name"
                placeholder="OpenResume"
                value={entry.name}
                onChange={(name) => update({ ...entry, name })}
              />
              <FieldTextarea
                label="Description"
                rows={2}
                placeholder="What it does, your role, and measurable impact"
                value={entry.description}
                onChange={(description) => update({ ...entry, description })}
              />
              <div>
                <span className={`mb-1 block ${fieldLabelClass}`}>Bullets</span>
                <StringList
                  items={entry.bullets}
                  onChange={(bullets) => update({ ...entry, bullets })}
                  placeholder="Describe an accomplishment..."
                  multiline
                  addLabel="Add bullet"
                  emptyLabel="No bullets yet."
                  reorderable
                  itemBadge={bulletBadge}
                  itemExtra={bulletRewrite}
                  onItemFocus={onFocusBullet && ((bulletIndex) => onFocusBullet(entry, bulletIndex))}
                  onItemBlur={onFocusBullet && (() => onFocusBullet(entry, null))}
                />
                {profileBulletsFor && bulletMatch && (
                  <div className="mt-2">
                    <BulletPicker
                      allBullets={profileBulletsFor(entry)}
                      included={entry.bullets}
                      onAdd={(bullet) => update({ ...entry, bullets: [...entry.bullets, bullet] })}
                      bulletMatch={bulletMatch}
                    />
                  </div>
                )}
              </div>
              <div>
                <span className={`mb-1 block ${fieldLabelClass}`}>Links</span>
                <EditableList<ContactLink>
                  items={entry.links}
                  onChange={(links) => update({ ...entry, links })}
                  newItem={() => ({ label: '', url: '' })}
                  addLabel="Add link"
                  emptyLabel="No links yet."
                  renderItem={(link, updateLink) => (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <FieldInput
                        placeholder="Label (e.g. Demo)"
                        value={link.label}
                        onChange={(label) => updateLink({ ...link, label })}
                      />
                      <FieldInput
                        placeholder="https://..."
                        value={link.url}
                        onChange={(url) => updateLink({ ...link, url })}
                      />
                    </div>
                  )}
                />
              </div>
            </div>
          )}
        />
        {excludedEntries && excludedEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Not included</p>
            {excludedEntries.map((entry, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onAddEntry?.(entry)}
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
              >
                <Plus size={13} className="shrink-0 text-slate-400" />
                <span className="flex-1 text-sm text-slate-500">{entry.name || 'Untitled project'}</span>
              </button>
            ))}
          </div>
        )}
      </Collapsible>
    </Card>
  );
}
