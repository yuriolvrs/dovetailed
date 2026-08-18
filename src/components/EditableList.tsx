// What this file is: a generic, reusable "add/remove items from a list" UI
// component. It owns list chrome only (add/remove buttons); callers supply
// the fields for each item. Every repeating list in the app (skills,
// experience, projects, education, writing samples, links, bullets) is
// built on top of this.
// In plain terms: a reusable building block for any list where you can add
// or remove entries — used all over the Profile page.

import { useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Btn, EmptyState } from './ui/primitives';

interface EditableListProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  newItem: () => T;
  addLabel?: string;
  emptyLabel?: string;
  /** Hide the trailing Add button -- for sections whose Add lives in a header instead. */
  hideAddButton?: boolean;
  /** Shows a drag handle on each row so items can be reordered by dragging. */
  reorderable?: boolean;
  /**
   * Row chrome. 'card' (default) boxes every row; 'flat' drops the box and
   * reveals the grip/remove buttons on hover or focus, for lists that should
   * read as content rather than as a stack of form controls.
   */
  variant?: 'card' | 'flat';
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
      className="shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-400 dark:hover:text-red-400 transition-colors p-0.5"
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
  reorderable = false,
  variant = 'card',
}: EditableListProps<T>) {
  const flat = variant === 'flat';
  // Hidden until the row is hovered or something inside it has focus, so a
  // flat list stays quiet while you read it.
  const hoverActionClass = flat
    ? 'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100'
    : '';
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function updateAt(index: number, next: T) {
    onChange(items.map((item, i) => (i === index ? next : item)));
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, newItem()]);
  }

  function handleDragStart(e: DragEvent, index: number) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null && index !== overIndex) setOverIndex(index);
  }

  function handleDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = items.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <div className={flat ? 'space-y-0.5' : 'space-y-3'}>
      {items.length === 0 && <EmptyState>{emptyLabel}</EmptyState>}
      {items.map((item, index) => (
        <div
          key={index}
          data-index={index}
          onDragOver={reorderable ? (e) => handleDragOver(e, index) : undefined}
          onDrop={reorderable ? () => handleDrop(index) : undefined}
          className={[
            'flex items-start gap-2 rounded-xl border transition-[opacity,border-color,background-color]',
            flat
              ? 'group rounded-lg px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/40'
              : 'bg-slate-100 dark:bg-slate-800 p-4',
            overIndex === index && dragIndex !== null && dragIndex !== index
              ? 'border-slate-400 dark:border-slate-500'
              : flat
                ? 'border-transparent'
                : 'border-slate-200 dark:border-slate-700',
            dragIndex === index ? 'opacity-50' : '',
          ].join(' ')}
        >
          {reorderable && (
            <span
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              className={`shrink-0 mt-0.5 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors ${hoverActionClass}`}
              aria-label="Drag to reorder"
            >
              <GripVertical size={14} />
            </span>
          )}
          <div className="flex-1">{renderItem(item, (next) => updateAt(index, next), index)}</div>
          <span className={hoverActionClass}>
            <RemoveItemButton onClick={() => removeAt(index)} />
          </span>
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
