// What this file is: a tiny hook backing the "Saved" flash shown next to a
// page's title wherever edits autosave immediately (Profile, a job
// posting's fields, the resume/matching editors) -- distinct from
// UnsavedIndicator, which flags a field that hasn't been persisted *yet*.
// This is the opposite signal: a brief confirmation that a just-made edit
// already made it to Dexie. Call `pulse()` right after the save call
// resolves (or fires, for the app's usual fire-and-forget autosave writes).
// In plain terms: makes the little "Saved" checkmark blink on for a moment
// every time something you edited gets autosaved.

import { useCallback, useRef, useState } from 'react';

const FLASH_MS = 1800;

export function useAutosaveIndicator() {
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restarts the flash on every call, so a burst of quick edits (typing,
  // several fields changed in a row) reads as one steady "Saved" instead of
  // flickering off and back on between keystrokes.
  const pulse = useCallback(() => {
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSaved(false), FLASH_MS);
  }, []);

  return { saved, pulse };
}
