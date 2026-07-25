// What this file is: a specialization of EditableList for the common case
// of a list of plain text entries (or paragraphs). Used for skill items,
// education details, writing samples, and bullets. The `multiline` flag
// switches between a single-line input and a textarea.
// In plain terms: a simpler version of the list component, just for lists
// of plain text.

import type { ReactNode } from 'react';
import { EditableList } from './EditableList';
import { fieldInputClass } from './ui/primitives';

interface StringListProps {
  items: string[];
  onChange: (items: string[]) => void;
  onBlurCommit?: (items: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
  addLabel?: string;
  emptyLabel?: string;
  hideAddButton?: boolean;
  /** Optional extra content rendered above an item's input, e.g. a warning badge. */
  itemBadge?: (value: string) => ReactNode;
}

/**
 * EditableList specialized for plain-string items: skill items, education
 * details, writing samples, bullets. Single place that owns the
 * input-vs-textarea choice and styling for "a list of text".
 *
 * In plain terms: the same add/remove list, just for simple text entries
 * instead of multi-field items.
 */
export function StringList({
  items,
  onChange,
  onBlurCommit,
  placeholder,
  multiline = false,
  addLabel = 'Add',
  emptyLabel,
  hideAddButton = false,
  itemBadge,
}: StringListProps) {
  const inputClass = `w-full ${fieldInputClass}`;

  return (
    <EditableList<string>
      items={items}
      onChange={onChange}
      newItem={() => ''}
      addLabel={addLabel}
      emptyLabel={emptyLabel}
      hideAddButton={hideAddButton}
      renderItem={(value, update) => (
        <div className={itemBadge ? 'space-y-1.5' : undefined}>
          {itemBadge?.(value)}
          {multiline ? (
            <textarea
              className={inputClass}
              rows={3}
              value={value}
              placeholder={placeholder}
              onChange={(e) => update(e.target.value)}
              onBlur={() => onBlurCommit?.(items)}
            />
          ) : (
            <input
              className={inputClass}
              type="text"
              value={value}
              placeholder={placeholder}
              onChange={(e) => update(e.target.value)}
              onBlur={() => onBlurCommit?.(items)}
            />
          )}
        </div>
      )}
    />
  );
}
