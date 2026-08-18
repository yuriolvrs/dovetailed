// What this file is: a tiny hook that runs a callback when Escape is pressed,
// but only while something dismissible is actually open. Used by every
// overlay in the app (the shared Modal, plus the History and Export
// popovers) so they all close the same way -- outside-click was already
// wired up everywhere, Escape was not.
// In plain terms: lets you press Esc to close a popup, everywhere.

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Calls `onEscape` on the Escape keydown while `active` is true. The callback
 * is held in a ref so an inline arrow function from the caller doesn't
 * re-subscribe the document listener on every render.
 * In plain terms: press Esc to close whatever is open.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  const callback = useRef(onEscape);

  useLayoutEffect(() => {
    callback.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    function handle(e: KeyboardEvent) {
      if (e.key === 'Escape') callback.current();
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [active]);
}
