// What this file is: the shared shell behind the Profile page's three
// list-of-entries tabs (Experience, Education, Projects) -- the card, the
// collapsible section header, the rail-plus-detail frame, and the selection
// and add/duplicate/delete behaviour that goes with them. Each tab supplies
// only what is specific to it: how a rail row reads, and what the detail
// pane contains.
// In plain terms: the common skeleton all three list tabs are built from, so
// they look and behave the same.

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Btn, Card, Collapsible, CollapsibleSectionHeader, EmptyState, SavedIndicator } from '../ui/primitives';
import { EntryRail } from './EntryRail';
import type { RailGroup, RailRow } from './EntryRail';

/** Actions the detail pane gets for the entry it is showing. */
export interface DetailActions<T> {
  entry: T;
  update: (next: T) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** True when this entry was just added, so the pane focuses its first field. */
  autoFocus: boolean;
  onFocused: () => void;
}

// Whether each section is expanded, kept outside the component because
// switching tabs unmounts it -- without this, collapsing a section is
// forgotten the moment you look at another tab.
const sectionOpen = new Map<string, boolean>();

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
  saved = false,
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
  /** Autosave confirmation, shown in this section's own header rather than
   *  only at the top of the page where it is off-screen while you type. */
  saved?: boolean;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
}) {
  const [open, setOpen] = useState(() => sectionOpen.get(title) ?? true);
  const [ownIndex, setOwnIndex] = useState(0);
  // Set when the user adds an entry, so the detail pane can put the caret in
  // the new entry's first field instead of leaving focus on the button.
  const [focusNew, setFocusNew] = useState(false);

  const selected = controlledIndex ?? ownIndex;
  const setSelected = controlledSelect ?? setOwnIndex;

  // Clamped rather than corrected in an effect: the list can shrink from
  // outside this component (an import, a restored backup), and a stale
  // selection should just fall back to the last entry.
  const selectedIndex = items.length === 0 ? -1 : Math.min(selected, items.length - 1);

  const railGroups: RailGroup<T>[] =
    groups ?? [{ label: title, items: items.map((entry, index) => ({ entry, index })) }];

  function add() {
    setFocusNew(true);
    if (onAddToGroup) {
      // No label: the destination is the caller's to resolve, since only it
      // knows which group the selected entry belongs to. Passing the first
      // group here silently overrode the section the user was working in.
      onAddToGroup('');
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
        onToggle={() =>
          setOpen((o) => {
            sectionOpen.set(title, !o);
            return !o;
          })
        }
        onAdd={add}
        addLabel={addLabel}
        extraActions={
          <>
            <SavedIndicator visible={saved} />
            {headerActions}
          </>
        }
      />
      <Collapsible open={open}>
        {selectedIndex < 0 ? (
          <EmptyState role="status">
            <div className="flex flex-col items-center gap-3">
              <span>{emptyLabel}</span>
              <Btn onClick={add}>
                <Plus size={14} />
                {addLabel}
              </Btn>
            </div>
          </EmptyState>
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
              footer={
                railFooter ?? (
                  <button
                    type="button"
                    onClick={add}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-300 hover:text-slate-700 dark:hover:border-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400/25"
                  >
                    <Plus size={13} />
                    {addLabel}
                  </button>
                )
              }
            />
            {renderDetail({
              entry: items[selectedIndex],
              update,
              onDuplicate: duplicateEntry,
              onDelete: deleteEntry,
              autoFocus: focusNew,
              onFocused: () => setFocusNew(false),
            })}
          </div>
        )}
      </Collapsible>
    </Card>
  );
}
