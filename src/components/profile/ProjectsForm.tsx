// What this file is: the editable form for the Projects section — a list
// of projects, each with a name, description, bullets, and links.
// In plain terms: the form where you list personal or work projects you've
// built.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ContactLink, ProjectEntry } from '../../types';
import { EditableList } from '../EditableList';
import { StringList } from '../StringList';
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
}: {
  value: ProjectEntry[];
  onChange: (projects: ProjectEntry[]) => void;
  /** Optional per-bullet extra content (e.g. an "unevidenced" warning badge) -- used by ResumeEditor, unused on the Profile page. */
  bulletBadge?: (bulletText: string) => ReactNode;
  /** Optional per-bullet "suggest a rewording" action -- used by ResumeEditor, unused on the Profile page. */
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
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
                  itemBadge={bulletBadge}
                  itemExtra={bulletRewrite}
                />
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
      </Collapsible>
    </Card>
  );
}
