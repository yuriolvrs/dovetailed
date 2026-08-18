// What this file is: the light/dark theme toggle button shown in the app
// header on every page.
// In plain terms: the button that switches the app between light and dark
// mode.

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getTheme, setTheme } from '../../lib/theme';

export function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
