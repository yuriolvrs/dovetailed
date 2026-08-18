// What this file is: the editable form for the Experience section -- a rail
// listing every position under its section heading next to a detail pane for
// the one that's selected, so the list stays visible while you edit one job.
// In plain terms: the screen where you list your past jobs and what you did
// at each one.

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ExperienceEntry } from '../../types';
import {
  DEFAULT_SECTION,
  addEntryToSection,
  moveEntryToSection,
  sectionOf,
  sectionOrder,
  setEntrySection,
} from '../../lib/experienceSections';
import { ExperienceRail } from './ExperienceRail';
import { ExperienceDetail } from './ExperienceDetail';
import { Card, Collapsible, CollapsibleSectionHeader, EmptyState } from '../ui/primitives';

function newExperienceEntry(): ExperienceEntry {
  return { section: 'Experience', company: '', title: '', current: false, bullets: [] };
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

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
  /** Optional per-bullet "suggest a rewording" action -- used by ResumeEditor and the Profile page. */
  bulletRewrite?: (bulletText: string, applySuggestion: (next: string) => void) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState(0);

  // Clamped rather than corrected in an effect: the list can shrink from
  // outside this component (an import, a restored backup), and a stale
  // selection should just fall back to the last position.
  const selectedIndex = value.length === 0 ? -1 : Math.min(selected, value.length - 1);
  const sections = value.length === 0 ? [DEFAULT_SECTION] : sectionOrder(value);
  const bulletTotal = value.reduce((total, entry) => total + entry.bullets.length, 0);

  function apply({ entries, index }: { entries: ExperienceEntry[]; index: number }) {
    onChange(entries);
    setSelected(index);
  }

  function addPosition(label: string) {
    apply(addEntryToSection(value, label, newExperienceEntry));
  }

  function updateEntry(next: ExperienceEntry) {
    onChange(value.map((entry, i) => (i === selectedIndex ? next : entry)));
  }

  function duplicateEntry() {
    const copy = { ...value[selectedIndex], bullets: [...value[selectedIndex].bullets] };
    const next = value.slice();
    next.splice(selectedIndex + 1, 0, copy);
    apply({ entries: next, index: selectedIndex + 1 });
  }

  function deleteEntry() {
    onChange(value.filter((_, i) => i !== selectedIndex));
    setSelected(Math.max(0, selectedIndex - 1));
  }

  return (
    <Card className="p-6">
      <CollapsibleSectionHeader
        title="Work Experience"
        sub={`${count(value.length, 'position')} · ${count(bulletTotal, 'highlight')}`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onAdd={() =>
          addPosition(selectedIndex >= 0 ? sectionOf(value[selectedIndex]) : DEFAULT_SECTION)
        }
        addLabel="Add position"
      />
      <Collapsible open={open}>
        {selectedIndex < 0 ? (
          <EmptyState>No experience entries yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <ExperienceRail
              entries={value}
              selectedIndex={selectedIndex}
              onSelect={setSelected}
              onReorder={(from, to, label) => apply(moveEntryToSection(value, from, to, label))}
              onAdd={addPosition}
            />
            <ExperienceDetail
              entry={value[selectedIndex]}
              onChange={updateEntry}
              onSectionChange={(label) => apply(setEntrySection(value, selectedIndex, label))}
              onDuplicate={duplicateEntry}
              onDelete={deleteEntry}
              sections={sections}
              bulletBadge={bulletBadge}
              bulletRewrite={bulletRewrite}
            />
          </div>
        )}
      </Collapsible>
    </Card>
  );
}
