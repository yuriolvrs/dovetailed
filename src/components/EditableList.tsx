// What this file is: a generic, reusable "add/remove items from a list" UI
// component. It owns list chrome only (add/remove buttons); callers supply
// the fields for each item. Every repeating list in the app (skills,
// experience, projects, education, writing samples, links, bullets) is
// built on top of this.
// In plain terms: a reusable building block for any list where you can add
// or remove entries — used all over the Profile page.

import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Btn } from './ui/primitives';

interface EditableListProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  newItem: () => T;
  addLabel?: string;
  emptyLabel?: string;
  /** Hide the trailing Add button -- for sections whose Add lives in a header instead. */
  hideAddButton?: boolean;
}

// Small trash-icon button for removing a row -- shared so every "remove this
// item" affordance in the app looks and behaves identically, whether or not
// the row lives inside an EditableList.
// In plain terms: the little trash icon used to remove a row from a list.
export function RemoveItemButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5"
      aria-label="Remove"
    >
      <Trash2 size={13} />
    </button>
  );
}

/**
 * Generic add/remove list editor. Owns list chrome only; callers render the
 * per-item fields. Every repeating-list section in the app (skills,
 * experience, projects, education, writing samples, links, bullets) is built
 * on this so they behave and look the same.
 *
 * In plain terms: the "add another item" / "remove this item" list you see
 * throughout the Profile page.
 */
export function EditableList<T>({
  items,
  onChange,
  renderItem,
  newItem,
  addLabel = 'Add',
  emptyLabel = 'Nothing here yet.',
  hideAddButton = false,
}: EditableListProps<T>) {
  function updateAt(index: number, next: T) {
    onChange(items.map((item, i) => (i === index ? next : item)));
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, newItem()]);
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <div className="py-8 text-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
          {emptyLabel}
        </div>
      )}
      {items.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-100 p-4"
        >
          <div className="flex-1">{renderItem(item, (next) => updateAt(index, next), index)}</div>
          <RemoveItemButton onClick={() => removeAt(index)} />
        </div>
      ))}
      {!hideAddButton && (
        <Btn type="button" size="sm" variant="secondary" onClick={add}>
          <Plus size={13} />
          {addLabel}
        </Btn>
      )}
    </div>
  );
}
