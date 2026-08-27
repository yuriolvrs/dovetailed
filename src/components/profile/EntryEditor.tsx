// What this file is: the shared shell behind the Profile page's three
// list-of-entries tabs (Experience, Education, Projects) -- the card, the
// collapsible section header, the rail-plus-detail frame, and the selection
// and add/duplicate/delete behaviour that goes with them. Each tab supplies
// only what is specific to it: how a rail row reads, and what the detail
// pane contains.
// In plain terms: the common skeleton all three list tabs are built from, so
// they look and behave the same.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Card, Collapsible, CollapsibleSectionHeader, EmptyState } from '../ui/primitives';
import { EntryRail } from './EntryRail';
import type { RailGroup, RailRow } from './EntryRail';

/** Actions the detail pane gets for the entry it is showing. */
export interface DetailActions<T> {
  entry: T;
  update: (next: T) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function EntryEditor<T>({
  title,
  sub,
  items,
  onChange,
  newItem,
  duplicate,
  addLabel,
  emptyLabel,
  searchPlaceholder,
  row,
  searchFields,
  renderDetail,
  groups,
  showGroupHeaders,
  railFooter,
  onAddToGroup,
  onReorder,
  headerActions,
  selectedIndex: controlledIndex,
  onSelect: controlledSelect,
}: {
  title: string;
  sub: string;
  items: T[];
  onChange: (next: T[]) => void;
  newItem: () => T;
  /** Deep-copies an entry for Duplicate -- callers own their own nesting. */
  duplicate: (entry: T) => T;
  addLabel: string;
  emptyLabel: string;
  searchPlaceholder: string;
  row: (entry: T) => RailRow;
  searchFields: (entry: T) => (string | undefined)[];
  renderDetail: (actions: DetailActions<T>) => ReactNode;
  /** Grouped rails (Experience) supply their own; the rest get one group. */
  groups?: RailGroup<T>[];
  showGroupHeaders?: boolean;
  railFooter?: ReactNode;
  /** Grouped rails add into a named group; ungrouped ones ignore the label. */
  onAddToGroup?: (label: string) => void;
  onReorder?: (from: number, to: number, label: string) => void;
  headerActions?: ReactNode;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const [open, setOpen] = useState(true);
  const [ownIndex, setOwnIndex] = useState(0);

  const selected = controlledIndex ?? ownIndex;
  const setSelected = controlledSelect ?? setOwnIndex;

  // Clamped rather than corrected in an effect: the list can shrink from
  // outside this component (an import, a restored backup), and a stale
  // selection should just fall back to the last entry.
  const selectedIndex = items.length === 0 ? -1 : Math.min(selected, items.length - 1);

  const railGroups: RailGroup<T>[] =
    groups ?? [{ label: title, items: items.map((entry, index) => ({ entry, index })) }];

  function add() {
    if (onAddToGroup) {
      onAddToGroup(railGroups[0]?.label ?? title);
      return;
    }
    onChange([...items, newItem()]);
    setSelected(items.length);
  }

  function update(next: T) {
    onChange(items.map((entry, i) => (i === selectedIndex ? next : entry)));
  }

  function duplicateEntry() {
    const next = items.slice();
    next.splice(selectedIndex + 1, 0, duplicate(items[selectedIndex]));
    onChange(next);
    setSelected(selectedIndex + 1);
  }

  function deleteEntry() {
    onChange(items.filter((_, i) => i !== selectedIndex));
    setSelected(Math.max(0, selectedIndex - 1));
  }

  function reorder(from: number, to: number, label: string) {
    if (onReorder) {
      onReorder(from, to, label);
      return;
    }
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(from < to ? to - 1 : to, 0, moved);
    onChange(next);
    setSelected(from < to ? to - 1 : to);
  }

  return (
    <Card className="p-6">
      <CollapsibleSectionHeader
        title={title}
        sub={sub}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onAdd={add}
        addLabel={addLabel}
        extraActions={headerActions}
      />
      <Collapsible open={open}>
        {selectedIndex < 0 ? (
          <EmptyState>{emptyLabel}</EmptyState>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <EntryRail<T>
              groups={railGroups}
              total={items.length}
              selectedIndex={selectedIndex}
              onSelect={setSelected}
              onReorder={reorder}
              onAdd={(label) => (onAddToGroup ? onAddToGroup(label) : add())}
              row={row}
              searchFields={searchFields}
              searchPlaceholder={searchPlaceholder}
              showGroupHeaders={showGroupHeaders}
              footer={railFooter}
            />
            {renderDetail({
              entry: items[selectedIndex],
              update,
              onDuplicate: duplicateEntry,
              onDelete: deleteEntry,
            })}
          </div>
        )}
      </Collapsible>
    </Card>
  );
}
