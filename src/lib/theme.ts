// What this file is: reads/writes the user's light-vs-dark theme choice.
// Persisted to localStorage (not Dexie -- a display preference, not user
// content) so it survives reloads; falls back to the OS preference the first
// time, before any explicit choice exists. The actual class-toggle this
// drives is also inlined as a tiny synchronous script in index.html, so the
// correct theme applies before React (or even the first paint) rather than
// flashing light-then-dark on every load -- this module is what the in-app
// toggle button calls afterward to change it.
// In plain terms: remembers whether you last chose light or dark mode, and
// applies it.

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/**
 * In plain terms: what theme is currently showing, read back from the DOM
 * (which index.html's inline script already set before React mounted).
 */
export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * In plain terms: switches the app to light or dark mode and remembers the
 * choice for next time.
 */
export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(STORAGE_KEY, theme);
}
