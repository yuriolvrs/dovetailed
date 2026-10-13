// What this file is: a specialization of EditableList for the common case
// of a list of plain text entries (or paragraphs). Used for skill items,
// education details, writing samples, and bullets. The `multiline` flag
// switches between a single-line input and a textarea.
// In plain terms: a simpler version of the list component, just for lists
// of plain text.

import { useLayoutEffect, useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { EditableList } from './EditableList';
import { splitBullets } from '../lib/splitBullets';
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

// Puts the cursor in the last quick-entry field once React has rendered it,
// e.g. right after "Add highlight" appends an empty bullet.
// In plain terms: jumps to the bullet you just added.
export function focusLastQuickEntry() {
  setTimeout(() => {
    const fields = document.querySelectorAll<HTMLTextAreaElement>('textarea[data-quick-entry]');
    fields[fields.length - 1]?.focus();
  });
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
  variant?: 'card' | 'flat' | 'prose';
  /** Names each field for screen readers as "<itemLabel> <n>", e.g. "Paragraph 2". */
  itemLabel?: string;
  /** Optional extra content rendered above an item's input, e.g. a warning badge. */
  itemBadge?: (value: string) => ReactNode;
  /** Optional extra content rendered below an item's input, e.g. a rewrite-suggestion action. */
  itemExtra?: (value: string, update: (next: string) => void) => ReactNode;
  /** Fires with an item's index when its field gains focus, e.g. to highlight the matching spot in a live preview. */
  onItemFocus?: (index: number) => void;
  /** Fires when an item's field loses focus. */
  onItemBlur?: () => void;
  /**
   * Multiline lists only. Enter starts the next item, Shift+Enter keeps a line
   * break, and pasting several lines splits them into one item per line.
   * Meant for one list per screen: focus moves by position among all such
   * fields on the page.
   */
  quickEntry?: boolean;
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
  itemLabel,
  itemBadge,
  itemExtra,
  onItemFocus,
  onItemBlur,
  quickEntry = false,
}: StringListProps) {
  const flat = variant === 'flat';
  const inputClass = `w-full ${
    variant === 'card' ? fieldInputClass : fieldInputFlatClass
  } ${variant === 'prose' ? 'leading-relaxed' : ''}`;

  // Moves focus `offset` fields after `from` once React has rendered them.
  // A zero-delay timer, not an animation frame: frames wait for the next
  // paint (and never run in a hidden tab), so fast typing landed in the old
  // field.
  // In plain terms: puts the cursor in the bullet you just started.
  function focusAfter(from: HTMLTextAreaElement, offset: number) {
    const fields = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea[data-quick-entry]'));
    const target = fields.indexOf(from) + offset;
    setTimeout(() => {
      document.querySelectorAll<HTMLTextAreaElement>('textarea[data-quick-entry]')[target]?.focus();
    });
  }

  // Enter splits the bullet at the cursor: the text after it moves to a new
  // bullet below. Ignored while an IME is composing and with Shift held.
  function handleEnter(e: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    const { value, selectionStart, selectionEnd } = e.currentTarget;
    const next = [...items];
    next.splice(index, 1, value.slice(0, selectionStart).trimEnd(), value.slice(selectionEnd).trimStart());
    onChange(next);
    focusAfter(e.currentTarget, 1);
  }

  // Several pasted lines become several bullets. Single-line pastes use the
  // browser's normal paste.
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>, index: number) {
    const pasted = e.clipboardData.getData('text');
    if (!/\r?\n/.test(pasted.trim())) return;
    const { value, selectionStart, selectionEnd } = e.currentTarget;
    const parts = splitBullets(value.slice(0, selectionStart) + pasted + value.slice(selectionEnd));
    if (parts.length === 0) return;
    e.preventDefault();
    const next = [...items];
    next.splice(index, 1, ...parts);
    onChange(next);
    focusAfter(e.currentTarget, parts.length - 1);
  }

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
          <div className={`min-w-0 flex-1 ${itemBadge || itemExtra ? 'space-y-1.5' : ''}`}>
            {itemBadge && <div className={variant === 'prose' ? 'px-2' : ''}>{itemBadge(value)}</div>}
            {multiline ? (
              <AutoGrowTextarea
                rows={1}
                className={inputClass}
                value={value}
                placeholder={placeholder}
                aria-label={itemLabel && `${itemLabel} ${index + 1}`}
                onChange={(e) => update(e.target.value)}
                onFocus={() => onItemFocus?.(index)}
                onBlur={() => {
                  onBlurCommit?.(items);
                  onItemBlur?.();
                }}
                {...(quickEntry && {
                  'data-quick-entry': '',
                  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => handleEnter(e, index),
                  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => handlePaste(e, index),
                })}
              />
            ) : (
              <input
                className={inputClass}
                type="text"
                value={value}
                placeholder={placeholder}
                aria-label={itemLabel && `${itemLabel} ${index + 1}`}
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
