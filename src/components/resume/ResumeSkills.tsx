// What this file is: the resume editor's Skills section as chips, one row
// per category. A chip on the resume has an x to take it off; the same
// category's other profile skills sit beside them as dashed "+" chips, the
// ones the job asks for marked with a check. "Edit list" swaps in the full
// skills form (rename categories, type new skills, reorder).
// In plain terms: pick which skills go on this resume with a click, with
// the job's wanted skills marked.

import { useState } from 'react';
import { Check, ListChecks, Plus, X } from 'lucide-react';
import type { SkillGroup } from '../../types';
import type { FitReason } from '../../lib/jobFit';
import { normalizeLine } from '../../lib/jobFit';
import { SheetSection } from '../profile/ProfileSections';
import { SkillsForm } from '../profile/SkillsForm';
import { Btn, ResetButton } from '../ui/primitives';

export function ResumeSkills({
  value,
  profileSkills,
  onChange,
  onReset,
  reasonFor,
}: {
  value: SkillGroup[];
  /** The profile's skills, offered as chips to add. */
  profileSkills: SkillGroup[];
  onChange: (next: SkillGroup[]) => void;
  onReset: () => void;
  reasonFor: (text: string) => FitReason | null;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div id="skills" className="scroll-mt-20">
        <SkillsForm value={value} onChange={onChange} onReset={onReset} />
        <div className="mt-2 flex justify-end">
          <Btn size="sm" onClick={() => setEditing(false)}>
            <Check size={13} />
            Done
          </Btn>
        </div>
      </div>
    );
  }

  // The resume's own categories in order, then any profile category it lacks.
  const categories = [
    ...value.map((g) => g.category),
    ...profileSkills.map((g) => g.category).filter((c) => !value.some((g) => g.category === c)),
  ];
  const total = value.reduce((sum, g) => sum + g.items.length, 0);

  function setItems(category: string, items: string[]) {
    const exists = value.some((g) => g.category === category);
    onChange(
      exists
        ? value.map((g) => (g.category === category ? { ...g, items } : g))
        : [...value, { category, items }],
    );
  }

  return (
    <SheetSection
      id="skills"
      title="Skills"
      meta={`${total} on this resume`}
      actions={
        <>
          <ResetButton onReset={onReset} />
          <Btn size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <ListChecks size={13} />
            Edit list
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        {categories.map((category) => {
          const items = value.find((g) => g.category === category)?.items ?? [];
          const onResume = new Set(items.map(normalizeLine));
          const left = (profileSkills.find((g) => g.category === category)?.items ?? []).filter(
            (s) => s.trim() !== '' && !onResume.has(normalizeLine(s)),
          );
          // Skills the job asks for come first among the ones to add.
          left.sort((a, b) => Number(Boolean(reasonFor(b))) - Number(Boolean(reasonFor(a))));
          if (items.length === 0 && left.length === 0) return null;
          return (
            <div key={category}>
              <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {category.trim() || 'Skills'}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {items.map((skill, i) => {
                  const fits = reasonFor(skill);
                  return (
                    <li
                      key={`${skill}-${i}`}
                      title={fits ? (fits.requirements.length ? `Fits: ${fits.requirements.join('; ')}` : 'Picked for this job') : undefined}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                    >
                      {fits && <Check size={12} aria-label="Fits this job" className="text-emerald-700 dark:text-emerald-400" />}
                      {skill}
                      <button
                        type="button"
                        onClick={() => setItems(category, items.filter((_, j) => j !== i))}
                        aria-label={`Take ${skill} off this resume`}
                        className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-900/[0.06] hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  );
                })}
                {left.map((skill) => {
                  const fits = reasonFor(skill);
                  return (
                    <li key={`add-${skill}`}>
                      <button
                        type="button"
                        onClick={() => setItems(category, [...items, skill])}
                        title={fits?.requirements.length ? `Fits: ${fits.requirements.join('; ')}` : undefined}
                        className={`inline-flex items-center gap-1 rounded-lg border border-dashed px-2 py-[3px] text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          fits
                            ? 'border-emerald-400 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-500/50 dark:text-emerald-300 dark:hover:bg-emerald-500/10'
                            : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:border-slate-600 dark:text-slate-400 dark:hover:text-slate-100'
                        }`}
                      >
                        <Plus size={12} aria-hidden />
                        <span className="sr-only">Add </span>
                        {skill}
                        {fits && <span className="sr-only"> (fits this job)</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </SheetSection>
  );
}
