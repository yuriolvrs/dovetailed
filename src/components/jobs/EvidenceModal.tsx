// What this file is: the one evidence-picker modal used everywhere on the
// Matching review screen -- adding evidence to a requirement, swapping a
// piece of evidence, and adding an "Additional information" accomplishment
// all reuse this same component (condensed Profile-page-style Skills/Work
// Experience/Projects sections, no date fields/location/form chrome, no
// Education). Callers control what's excluded/shown via props rather than
// this component knowing about requirements or additional-info at all:
// - `atoms` is whatever the caller has already filtered eligible (e.g. the
//   Swap caller excludes the requirement's existing evidence); this component
//   then narrows to the sources it can show at all (SELECTABLE_SOURCES).
// - `confirmedAtoms` drives the pinned "current" summary (and, since those
//   are also unavailable to pick again, dims/"Added"-labels them too).
// - `disabledAtomIds` dims/"Added"-labels additional items in the browse
//   list *without* adding them to that pinned summary -- e.g. the
//   Additional-information picker uses this to grey out atoms already used
//   elsewhere or already copied in, matching the requirement picker's dim
//   treatment instead of just hiding them.
// - `closeOnSelect` distinguishes a single-pick action (Swap) from a
//   multi-add one (Add evidence / Add accomplishment, which stay open so
//   the user can click several items in a row).
// In plain terms: a popup for picking which skills, jobs, or projects prove
// something -- reused for every "pick evidence" moment on this screen.

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { ProfileAtom } from '../../types';
import { Btn, Modal, SectionTitle, fieldInputClass } from '../ui/primitives';

const SELECTABLE_SOURCES: ProfileAtom['source'][] = ['skills', 'experience', 'projects'];

function groupBySourceLabel(atoms: ProfileAtom[]): [string, ProfileAtom[]][] {
  const groups = new Map<string, ProfileAtom[]>();
  for (const atom of atoms) {
    const group = groups.get(atom.sourceLabel) ?? [];
    group.push(atom);
    groups.set(atom.sourceLabel, group);
  }
  return [...groups.entries()];
}

// atom.sourceLabel is e.g. "Experience: Title, Company" / "Project: Name" --
// strip the source's own prefix since it's already implied by the section heading.
// In plain terms: removes the "Experience:" / "Project:" prefix from a label
// so it isn't shown twice.
function stripLabelPrefix(label: string): string {
  const idx = label.indexOf(': ');
  return idx === -1 ? label : label.slice(idx + 2);
}

type ChipVariant = 'default' | 'added' | 'confirmed';

// Confirmed evidence always wins over "already added elsewhere" -- shared so
// the chip and entry-list treatments of the same atom never disagree.
// In plain terms: figures out whether to show an atom as picked, greyed out,
// or normal.
function atomState(atomId: string, confirmedIds: Set<string>, addedIds: Set<string>): ChipVariant {
  if (confirmedIds.has(atomId)) return 'confirmed';
  if (addedIds.has(atomId)) return 'added';
  return 'default';
}

function SkillChip({
  atom,
  variant,
  onSelect,
  onRemove,
}: {
  atom: ProfileAtom;
  variant: ChipVariant;
  onSelect: () => void;
  onRemove: () => void;
}) {
  if (variant === 'confirmed') {
    return (
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 transition-colors"
      >
        {atom.text}
        <span className="text-[9px] uppercase tracking-wide">Added</span>
      </button>
    );
  }
  const added = variant === 'added';
  return (
    <button
      type="button"
      disabled={added}
      onClick={onSelect}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        added
          ? 'bg-slate-50 text-slate-300 cursor-default dark:bg-slate-900 dark:text-slate-700'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      {atom.text}
      {added && <span className="text-[9px] uppercase tracking-wide">Added</span>}
    </button>
  );
}

function EntryCard({
  label,
  bullets,
  addedIds,
  confirmedIds,
  onSelect,
  onRemove,
}: {
  label: string;
  bullets: ProfileAtom[];
  addedIds: Set<string>;
  confirmedIds: Set<string>;
  onSelect: (atomId: string) => void;
  onRemove: (atomId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">{stripLabelPrefix(label)}</p>
      <div className="space-y-1">
        {bullets.map((atom) => {
          const state = atomState(atom.id, confirmedIds, addedIds);
          const confirmed = state === 'confirmed';
          const added = state === 'added';
          return (
            <button
              key={atom.id}
              type="button"
              disabled={added}
              onClick={() => (confirmed ? onRemove(atom.id) : onSelect(atom.id))}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                confirmed
                  ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20'
                  : added
                    ? 'text-slate-300 cursor-default dark:text-slate-700'
                    : 'text-slate-600 hover:bg-blue-50/50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-blue-500/10 dark:hover:text-slate-100'
              }`}
            >
              {atom.text}
              {(confirmed || added) && (
                <span
                  className={`ml-2 text-[9px] uppercase tracking-wide ${confirmed ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-700'}`}
                >
                  Added
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EvidenceModal({
  open,
  onClose,
  title = 'Add evidence',
  subtitle,
  confirmedAtoms = [],
  confirmedLabel = 'Current evidence',
  disabledAtomIds,
  atoms,
  newEntryPlaceholder = 'Or write new evidence…',
  closeOnSelect = false,
  onSelectExisting,
  onCreateNew,
  onRemoveExisting,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  confirmedAtoms?: ProfileAtom[];
  confirmedLabel?: string;
  disabledAtomIds?: Set<string>;
  atoms: ProfileAtom[];
  newEntryPlaceholder?: string;
  closeOnSelect?: boolean;
  onSelectExisting: (atomId: string) => void;
  onCreateNew: (text: string) => void;
  // When provided, atoms already in confirmedAtoms render as green/removable
  // chips (click to remove) instead of the default grey/disabled "Added"
  // treatment -- used for the per-requirement evidence picker only, where
  // removing evidence is a meaningful action. Elsewhere (swap, additional
  // info) confirmedAtoms/disabledAtomIds stay grey and non-interactive.
  onRemoveExisting?: (atomId: string) => void;
}) {
  const [newText, setNewText] = useState('');
  const [search, setSearch] = useState('');

  // Search is a per-open scratch value, not something that should survive
  // this modal being reused for the next atom/requirement.
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const confirmedIds = onRemoveExisting ? new Set(confirmedAtoms.map((a) => a.id)) : new Set<string>();
  const addedIds = onRemoveExisting
    ? new Set(disabledAtomIds ?? [])
    : new Set([...confirmedAtoms.map((a) => a.id), ...(disabledAtomIds ?? [])]);
  const query = search.trim().toLowerCase();
  const matchesQuery = (atom: ProfileAtom) =>
    query === '' || atom.text.toLowerCase().includes(query) || atom.sourceLabel.toLowerCase().includes(query);
  const selectable = atoms.filter((a) => SELECTABLE_SOURCES.includes(a.source) && matchesQuery(a));
  const skillAtoms = selectable.filter((a) => a.source === 'skills');
  const experienceGroups = groupBySourceLabel(selectable.filter((a) => a.source === 'experience'));
  const projectGroups = groupBySourceLabel(selectable.filter((a) => a.source === 'projects'));
  const noResults = query !== '' && skillAtoms.length === 0 && experienceGroups.length === 0 && projectGroups.length === 0;

  function removeExisting(atomId: string) {
    onRemoveExisting?.(atomId);
  }

  function selectExisting(atomId: string) {
    onSelectExisting(atomId);
    if (closeOnSelect) onClose();
  }

  function createNew() {
    if (newText.trim() === '') return;
    onCreateNew(newText.trim());
    setNewText('');
    if (closeOnSelect) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} className="max-w-xl max-h-[85vh]">
      <div className="flex-1 overflow-y-auto scroll-thin p-5 space-y-5">
        <div>
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{subtitle}</p>}
          {confirmedAtoms.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{confirmedLabel}</p>
              {confirmedAtoms.map((atom) =>
                onRemoveExisting ? (
                  <button
                    key={atom.id}
                    type="button"
                    onClick={() => onRemoveExisting(atom.id)}
                    className="w-full flex items-center justify-between gap-2 text-left text-xs text-slate-600 dark:text-slate-300 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors group"
                  >
                    <span>
                      <span className="text-slate-400 dark:text-slate-500">{atom.sourceLabel}: </span>
                      {atom.text}
                    </span>
                    <X
                      size={12}
                      className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-red-400 dark:group-hover:text-red-400 transition-colors"
                    />
                  </button>
                ) : (
                  <div key={atom.id} className="text-xs text-slate-600 dark:text-slate-300 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <span className="text-slate-400 dark:text-slate-500">{atom.sourceLabel}: </span>
                    {atom.text}
                  </div>
                ),
              )}
            </div>
          )}
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your profile…"
              className={`w-full pl-9 ${fieldInputClass}`}
            />
          </div>
        </div>

        {noResults && <p className="text-xs text-slate-300 dark:text-slate-600">No matches for "{search.trim()}".</p>}

        {skillAtoms.length > 0 && (
          <div>
            <SectionTitle>Skills</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {skillAtoms.map((atom) => (
                <SkillChip
                  key={atom.id}
                  atom={atom}
                  variant={atomState(atom.id, confirmedIds, addedIds)}
                  onSelect={() => selectExisting(atom.id)}
                  onRemove={() => removeExisting(atom.id)}
                />
              ))}
            </div>
          </div>
        )}

        {experienceGroups.length > 0 && (
          <div>
            <SectionTitle>Work Experience</SectionTitle>
            <div className="space-y-2">
              {experienceGroups.map(([label, bullets]) => (
                <EntryCard
                  key={label}
                  label={label}
                  bullets={bullets}
                  addedIds={addedIds}
                  confirmedIds={confirmedIds}
                  onSelect={selectExisting}
                  onRemove={removeExisting}
                />
              ))}
            </div>
          </div>
        )}

        {projectGroups.length > 0 && (
          <div>
            <SectionTitle>Projects</SectionTitle>
            <div className="space-y-2">
              {projectGroups.map(([label, bullets]) => (
                <EntryCard
                  key={label}
                  label={label}
                  bullets={bullets}
                  addedIds={addedIds}
                  confirmedIds={confirmedIds}
                  onSelect={selectExisting}
                  onRemove={removeExisting}
                />
              ))}
            </div>
          </div>
        )}

        {skillAtoms.length === 0 && experienceGroups.length === 0 && projectGroups.length === 0 && (
          <p className="text-xs text-slate-300 dark:text-slate-600">Nothing in your profile yet -- write new evidence below.</p>
        )}
      </div>

      <div className="p-5 border-t border-slate-100 dark:border-slate-800 shrink-0 flex gap-2">
        <input
          className={`flex-1 ${fieldInputClass}`}
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={newEntryPlaceholder}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), createNew())}
        />
        <Btn size="sm" variant="secondary" onClick={createNew} disabled={newText.trim() === ''}>
          Add
        </Btn>
      </div>
    </Modal>
  );
}
