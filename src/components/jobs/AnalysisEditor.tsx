// What this file is: the editable form for a job posting's extracted
// analysis -- role summary, a single requirements table (required + preferred
// mixed, severity shown as a per-row selector), and keywords. Matching (which
// profile evidence supports each requirement) happens on the separate
// Matching review screen, not here. Renders as one flat block of sections
// (divided by rules, not nested cards) so the caller can drop it straight
// into its own Card without stacking cards inside cards.
// In plain terms: the form where you review and fix up the AI's read on a
// job posting -- the role, what it requires, and the key terms -- before
// running matching against your profile.

import { Plus } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { JobAnalysis, Requirement, RequirementSeverity } from '../../types';
import { RemoveItemButton } from '../EditableList';
import { Btn, FieldTextarea, TagInput } from '../ui/primitives';

function nextOrder(requirements: Requirement[]): number {
  return requirements.length === 0 ? 0 : Math.max(...requirements.map((r) => r.order)) + 1;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">{children}</p>
  );
}

// Grows to fit its content instead of scrolling internally -- so a long
// requirement pushes the row (and the scrollable list around it) taller
// rather than getting its own inner scrollbar.
// In plain terms: a text box that expands as you type instead of scrolling.
function AutoGrowTextarea({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={1}
      className={className}
    />
  );
}

function RequirementRow({
  requirement,
  onUpdate,
  onRemove,
}: {
  requirement: Requirement;
  onUpdate: (next: Requirement) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
      <AutoGrowTextarea
        value={requirement.text}
        onChange={(text) => onUpdate({ ...requirement, text })}
        className="flex-1 resize-none overflow-hidden bg-transparent text-sm text-slate-700 leading-relaxed outline-none border border-transparent rounded-lg -mx-1.5 px-1.5 py-1 focus:border-blue-300 focus:bg-blue-50/20 transition-all"
      />
      <select
        value={requirement.severity}
        onChange={(e) => onUpdate({ ...requirement, severity: e.target.value as RequirementSeverity })}
        className="shrink-0 w-24 mt-1 text-xs rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 outline-none focus:border-blue-400 transition-all"
      >
        <option value="required">Required</option>
        <option value="preferred">Preferred</option>
      </select>
      <div className="shrink-0 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <RemoveItemButton onClick={onRemove} />
      </div>
    </div>
  );
}

export function AnalysisEditor({
  value,
  onChange,
}: {
  value: JobAnalysis;
  onChange: (analysis: JobAnalysis) => void;
}) {
  const requirements = [...value.requirements].sort((a, b) => a.order - b.order);

  function setRequirements(next: Requirement[]) {
    onChange({ ...value, requirements: next });
  }

  function addRequirement() {
    setRequirements([
      ...value.requirements,
      { id: crypto.randomUUID(), text: '', severity: 'required', order: nextOrder(value.requirements) },
    ]);
  }

  return (
    <div>
      <div>
        <SectionLabel>Role Summary</SectionLabel>
        <FieldTextarea
          value={value.roleSummary}
          onChange={(roleSummary) => onChange({ ...value, roleSummary })}
          rows={4}
        />
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <SectionLabel>Requirements</SectionLabel>
        {requirements.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-300 border-2 border-dashed border-slate-100 rounded-xl">
            No requirements listed.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 pb-2 border-b border-slate-200 text-[10px] font-semibold text-slate-300 uppercase tracking-widest">
              <span className="flex-1">Requirement</span>
              <span className="shrink-0 w-24">Type</span>
              <span className="shrink-0 w-[13px]" />
            </div>
            {requirements.map((requirement) => (
              <RequirementRow
                key={requirement.id}
                requirement={requirement}
                onUpdate={(next) => setRequirements(requirements.map((r) => (r.id === next.id ? next : r)))}
                onRemove={() => setRequirements(requirements.filter((r) => r.id !== requirement.id))}
              />
            ))}
          </>
        )}
        <div className="mt-3">
          <Btn size="sm" variant="secondary" onClick={addRequirement}>
            <Plus size={13} />
            Add requirement
          </Btn>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <SectionLabel>Keywords</SectionLabel>
        <TagInput
          value={value.keywords}
          onChange={(keywords) => onChange({ ...value, keywords })}
          placeholder="Add keyword…"
          emptyLabel="No keywords listed."
        />
      </div>
    </div>
  );
}
