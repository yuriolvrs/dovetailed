// What this file is: sets the "dark" class on the page from the system color scheme, so the shared Tailwind components get dark styles.
// In plain terms: makes extension pages follow your light or dark system setting.

/** Applies the system color scheme now and keeps it in sync. */
export function followSystemTheme(): void {
  const query = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', query.matches);
  apply();
  query.addEventListener('change', apply);
}
