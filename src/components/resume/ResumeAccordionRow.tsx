// What this file is: the shared collapsed/expanded row shell used by the
// Generate step's Work Experience and Education accordion lists -- a
// one-line collapsed summary with ▲/▼ reorder buttons and a remove button,
// expanding into whatever form fields the caller renders as children.
// In plain terms: the "click to expand a job/school entry" row, with the
// up/down arrows that reorder it and the trash icon that deletes it.

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { RemoveItemButton } from '../EditableList';

export function ResumeAccordionRow({
  open,
  onToggle,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onRemove,
  badge,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemove: () => void;
  badge?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-2 py-3 px-1">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label="Move up"
            className="w-5 h-4 flex items-center justify-center rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors"
          >
            <ChevronDown size={12} className="rotate-180" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label="Move down"
            className="w-5 h-4 flex items-center justify-center rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300 transition-colors"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        <button type="button" onClick={onToggle} className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-slate-800 truncate">{title}</div>
          {subtitle && <div className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</div>}
        </button>

        {badge}

        <RemoveItemButton onClick={onRemove} />

        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? 'Collapse' : 'Expand'}
          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors shrink-0"
        >
          <ChevronDown size={13} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && <div className="pb-4 px-1 pl-9 space-y-3">{children}</div>}
    </div>
  );
}
