// What this file is: the Edit/Preview switch shown above a document editor
// on narrow screens, where the editor and its live preview take turns
// instead of stacking. Hidden from the lg breakpoint up, where both show.
// In plain terms: the phone-only toggle between editing and seeing the page.

export type Pane = 'edit' | 'preview';

/**
 * Two-option segmented control, styled like RouteSwitch.
 * In plain terms: the Edit / Preview buttons on a phone.
 */
export function PaneSwitch({ pane, onChange }: { pane: Pane; onChange: (pane: Pane) => void }) {
  return (
    <div
      role="group"
      aria-label="Show"
      className="mb-4 flex w-fit rounded-xl bg-slate-100 p-0.5 lg:hidden print:hidden dark:bg-slate-800"
    >
      {(['edit', 'preview'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={pane === option}
          onClick={() => onChange(option)}
          className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-colors ${
            pane === option
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
          }`}
        >
          {option === 'edit' ? 'Edit' : 'Preview'}
        </button>
      ))}
    </div>
  );
}

/** Classes that hide a pane on narrow screens while the other one is showing. */
export function paneClass(pane: Pane, self: Pane): string {
  return pane === self ? '' : 'hidden lg:block';
}
