// What this file is: a specialization of EditableList for the common case
// of a list of plain text entries (or paragraphs). Used for skill items,
// education details, writing samples, and bullets. The `multiline` flag
// switches between a single-line input and a textarea.
// In plain terms: a simpler version of the list component, just for lists
// of plain text.

import { useLayoutEffect, useRef } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { EditableList } from './EditableList';
import { fieldInputClass, fieldInputFlatClass } from './ui/primitives';

// A textarea that grows to fit its content instead of scrolling internally,
// so a long bullet/paragraph is fully visible without the user having to
// resize or scroll each field individually.
// In plain terms: a text box that expands as you type instead of hiding the
// rest of what you wrote behind a scrollbar.
export function AutoGrowTextarea({
  value,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return <textarea ref={ref} value={value} className={`${className} resize-none overflow-hidden`} {...props} />;
}

interface StringListProps {
  items: string[];
  onChange: (items: string[]) => void;
  onBlurCommit?: (items: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
  addLabel?: string;
  emptyLabel?: string;
  hideAddButton?: boolean;
  /** Shows a drag handle on each item so bullets can be reordered by dragging. */
  reorderable?: boolean;
  /** Row chrome, forwarded to EditableList -- 'flat' also drops the field's own box and marks each item with a bullet dot. */
  variant?: 'card' | 'flat';
  /** Optional extra content rendered above an item's input, e.g. a warning badge. */
  itemBadge?: (value: string) => ReactNode;
  /** Optional extra content rendered below an item's input, e.g. a rewrite-suggestion action. */
  itemExtra?: (value: string, update: (next: string) => void) => ReactNode;
  /** Fires with an item's index when its field gains focus, e.g. to highlight the matching spot in a live preview. */
  onItemFocus?: (index: number) => void;
  /** Fires when an item's field loses focus. */
  onItemBlur?: () => void;
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
  reorderable = false,
  variant = 'card',
  itemBadge,
  itemExtra,
  onItemFocus,
  onItemBlur,
}: StringListProps) {
  const flat = variant === 'flat';
  const inputClass = `w-full ${flat ? fieldInputFlatClass : fieldInputClass}`;

  return (
    <EditableList<string>
      items={items}
      onChange={onChange}
      newItem={() => ''}
      addLabel={addLabel}
      emptyLabel={emptyLabel}
      hideAddButton={hideAddButton}
      reorderable={reorderable}
      variant={variant}
      renderItem={(value, update, index) => (
        <div className={flat ? 'flex items-start gap-2' : ''}>
          {flat && (
            <span
              aria-hidden
              className="mt-3 h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
            />
          )}
          <div className={`flex-1 ${itemBadge || itemExtra ? 'space-y-1.5' : ''}`}>
            {itemBadge?.(value)}
            {multiline ? (
              <AutoGrowTextarea
                rows={1}
                className={inputClass}
                value={value}
                placeholder={placeholder}
                onChange={(e) => update(e.target.value)}
                onFocus={() => onItemFocus?.(index)}
                onBlur={() => {
                  onBlurCommit?.(items);
                  onItemBlur?.();
                }}
              />
            ) : (
              <input
                className={inputClass}
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(e) => update(e.target.value)}
                onFocus={() => onItemFocus?.(index)}
                onBlur={() => {
                  onBlurCommit?.(items);
                  onItemBlur?.();
                }}
              />
            )}
            {itemExtra?.(value, update)}
          </div>
        </div>
      )}
    />
  );
}
