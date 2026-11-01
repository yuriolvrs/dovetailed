// What this file is: one section of the options page. A top hairline, a title and hint on the left, and the fields on the right. It stacks on narrow screens.
// In plain terms: the layout for each group of settings, with no box around it.
import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-x-12 gap-y-4 border-t border-slate-200 py-8 dark:border-slate-800 md:grid-cols-[13rem_1fr]">
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        {hint && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
