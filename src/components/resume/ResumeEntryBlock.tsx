// What this file is: one job or project on the resume editor. Its bullets are
// always open for editing: type to change one, drag its handle or press
// Alt+Up/Down to move it, "Reword" for AI suggestions, the minus to take it
// off this resume. Under them, the entry's other profile bullets wait to be
// added back, the ones that fit the job first. The heading's buttons edit
// the title and dates, move the entry, or take it off the resume.
// In plain terms: one job or project, with every bullet ready to edit,
// reorder, reword, or swap for another line from your profile.

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Minus, Pencil, Plus, Sparkles } from 'lucide-react';
import type { FitReason } from '../../lib/jobFit';
import { BULLET_REWORD_GOALS } from '../../prompts/suggestBulletRewrite';
import { StringList } from '../StringList';
import { BulletPicker } from '../BulletPicker';
import { FitLabel } from './FitLabel';
import { RewordPanel, requestBulletRewording } from './BulletRewriteSuggest';
import { Btn } from '../ui/primitives';

/**
 * A small square icon button with a visible tooltip name.
 * In plain terms: one of the little buttons beside an entry's title.
 */
export function IconBtn({
  label,
  onClick,
  disabled = false,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Set for a toggle, e.g. the details form being open. */
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-30 ${
        pressed
          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'text-slate-500 hover:bg-slate-900/[0.06] hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

export function ResumeEntryBlock({
  navKey,
  title,
  untitled,
  subtitle,
  aside,
  details,
  bullets,
  onBulletsChange,
  profileBullets,
  reasonFor,
  postingTerms,
  onMoveUp,
  onMoveDown,
  onRemove,
  onBulletFocus,
  onBulletBlur,
  detailsOpen,
  onToggleDetails,
}: {
  /** Matches the preview's click target, e.g. "experience:<key>". */
  navKey: string;
  title: string;
  untitled: string;
  subtitle?: string;
  /** Right of the title, e.g. the dates. */
  aside?: string;
  /** The title/dates form, shown while detailsOpen. */
  details: ReactNode;
  bullets: string[];
  onBulletsChange: (bullets: string[]) => void;
  /** The same entry's bullets on the profile, for the left-out list. */
  profileBullets: string[];
  reasonFor: (text: string) => FitReason | null;
  /** Posting keywords for the "Posting's words" reword goal; empty hides it. */
  postingTerms: string[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove: () => void;
  onBulletFocus: (index: number) => void;
  onBulletBlur: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  // Which bullet's reword panel is open. Kept by position: applying a
  // suggestion changes the text, and the panel should stay open to offer Undo.
  const [rewording, setRewording] = useState<number | null>(null);
  const goals = BULLET_REWORD_GOALS.filter((g) => g.id !== 'posting' || postingTerms.length > 0);
  const printed = bullets.filter((b) => b.trim() !== '');
  const ref = useRef<HTMLElement>(null);

  return (
    <article ref={ref} data-resume-entry={navKey} className="scroll-mt-24 rounded-xl py-4 transition-shadow">
      {/* The buttons drop under the title when the column is narrow, so a long title keeps the width. */}
      <div className="group/head flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            {title.trim() || <span className="text-slate-500 dark:text-slate-400">{untitled}</span>}
          </h3>
          {/* Dates share the second line, so a long title gets the full width. */}
          {(subtitle?.trim() || aside) && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {[subtitle?.trim(), aside].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="-mr-1.5 -mt-1 ml-auto flex shrink-0 items-center">
          <span className="flex items-center opacity-0 transition-opacity group-hover/head:opacity-100 group-focus-within/head:opacity-100 [@media(hover:none)]:opacity-100">
            <IconBtn label="Move up" onClick={() => onMoveUp?.()} disabled={!onMoveUp}>
              <ArrowUp size={14} />
            </IconBtn>
            <IconBtn label="Move down" onClick={() => onMoveDown?.()} disabled={!onMoveDown}>
              <ArrowDown size={14} />
            </IconBtn>
            <IconBtn label="Take off this resume" onClick={onRemove}>
              <Minus size={14} />
            </IconBtn>
          </span>
          <Btn size="sm" variant="ghost" onClick={onToggleDetails} ariaLabel="Edit title and dates" ariaExpanded={detailsOpen}>
            <Pencil size={13} />
            Edit
          </Btn>
        </div>
      </div>

      {detailsOpen && <div className="mt-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40">{details}</div>}

      {printed.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertCircle size={13} aria-hidden />
          Not printed until it has a bullet.
        </p>
      )}

      <div className="-mx-1.5 mt-1.5">
        <StringList
          // An entry with no bullets still shows one field to type into.
          items={bullets.length > 0 ? bullets : ['']}
          onChange={onBulletsChange}
          placeholder="Describe an accomplishment (Enter starts the next one)"
          multiline
          variant="flat"
          hideAddButton
          quickEntry
          reorderable
          itemLabel="Bullet"
          removeLabel="Take off this resume"
          actionsAlwaysVisible
          onItemFocus={onBulletFocus}
          onItemBlur={onBulletBlur}
          itemActions={(value, index) =>
            value.trim() !== '' && (
              <button
                type="button"
                onClick={() => setRewording(rewording === index ? null : index)}
                aria-label="Reword with AI"
                aria-expanded={rewording === index}
                title="Reword with AI"
                className={`inline-flex items-center gap-1 rounded p-0.5 text-xs transition-colors ${
                  rewording === index
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400'
                }`}
              >
                <Sparkles size={13} />
                {/* Icon only on phones, where the text column needs the width. */}
                <span className="hidden sm:inline">Reword</span>
              </button>
            )
          }
          itemExtra={(value, update, index) => {
            const reason = value.trim() ? reasonFor(value) : null;
            if (!reason && rewording !== index) return null;
            return (
              <div className="px-2">
                {reason && <FitLabel reason={reason} />}
                {rewording === index && (
                  <RewordPanel
                    text={value}
                    goals={goals}
                    request={(goal) => requestBulletRewording(value, goal, postingTerms)}
                    onApply={update}
                    onClose={() => setRewording(null)}
                  />
                )}
              </div>
            );
          }}
        />
      </div>
      <BulletPicker
        allBullets={profileBullets}
        included={bullets}
        onAdd={(bullet) => onBulletsChange([...bullets.filter((b) => b.trim() !== ''), bullet])}
        reasonFor={reasonFor}
        footerStart={
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              onBulletsChange([...bullets, '']);
              // This entry's new last field, once React has rendered it.
              setTimeout(() => {
                const fields = ref.current?.querySelectorAll<HTMLTextAreaElement>('textarea[data-quick-entry]');
                fields?.[fields.length - 1]?.focus();
              });
            }}
          >
            <Plus size={13} />
            Write a bullet
          </Btn>
        }
      />
    </article>
  );
}
