// What this file is: the editable form for the Skills section — a list of
// named categories (e.g. "Languages", "Frameworks"), each holding a
// chip-based list of individual skills. Categories are freely renamed/added/
// removed, same add/remove pattern as every other repeating section. Skills
// can be dragged from one category's chip list into another (TagInput's
// cross-list drag, keyed by category index). An opt-in "AI Categorize"
// button re-groups every skill across all categories in one LLM call --
// see prompts/categorizeSkills.ts for how its response is filtered so it
// can't invent or lose a skill. onReset is optional because this form is
// also mounted on the Profile page, where there's no separate profile to
// reset from -- only ResumeEditor passes it.
// In plain terms: the form where you group your skills under headings like
// "Languages" or "Tools", add/remove/drag skills between groups, ask the AI
// to sort them into groups for you, or (on the resume screen) reset back to
// what's in your profile.

import { useEffect, useRef, useState } from 'react';
import { Rows3, Sparkles } from 'lucide-react';
import type { SkillGroup } from '../../types';
import { EditableList } from '../EditableList';
import { Btn, Card, Collapsible, CollapsibleSectionHeader, FieldInput, ResetButton, TagInput } from '../ui/primitives';
import { buildCategorizeSkillsPrompt, isCategorizeSkillsResult, reconcileCategorization } from '../../prompts/categorizeSkills';
import { generateStructured, llmErrorMessage } from '../../lib/llm';

function newSkillGroup(): SkillGroup {
  return { category: '', items: [] };
}

export function SkillsForm({
  value,
  onChange,
  onReset,
  navRequest,
}: {
  value: SkillGroup[];
  onChange: (skills: SkillGroup[]) => void;
  /** Re-imports this section's skill categories from the profile, discarding edits made here -- used by ResumeEditor, unused on the Profile page. */
  onReset?: () => void;
  /** A click on this skills group in the live preview, requesting it open and scroll into view -- used by ResumeEditor, unused on the Profile page. */
  navRequest?: { groupIndex: number; nonce: number } | null;
}) {
  const [open, setOpen] = useState(true);
  const [categorizing, setCategorizing] = useState(false);
  const [categorizeError, setCategorizeError] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const allItems = value.flatMap((g) => g.items);

  useEffect(() => {
    if (!navRequest) return;
    if (navRequest.groupIndex < 0 || navRequest.groupIndex >= value.length) return;
    setOpen(true);
    setHighlightIndex(navRequest.groupIndex);
    const highlightTimer = setTimeout(() => setHighlightIndex(null), 1500);
    const scrollTimer = setTimeout(() => {
      containerRef.current
        ?.querySelector(`[data-index="${navRequest.groupIndex}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    // Also unconditionally clears the highlight on cleanup -- otherwise
    // when navRequest flips to null/a different group, this effect reruns,
    // its cleanup cancels the pending "un-highlight" timeout, and the
    // highlight is left stuck on forever.
    return () => {
      clearTimeout(highlightTimer);
      clearTimeout(scrollTimer);
      setHighlightIndex(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  async function handleCategorize() {
    if (allItems.length === 0) return;
    setCategorizing(true);
    setCategorizeError(null);
    try {
      const prompt = buildCategorizeSkillsPrompt(allItems);
      const result = await generateStructured(prompt, isCategorizeSkillsResult, { temperature: 0.2, maxTokens: 700 });
      onChange(reconcileCategorization(allItems, result));
    } catch (err) {
      setCategorizeError(llmErrorMessage(err, 'Categorizing skills'));
    } finally {
      setCategorizing(false);
    }
  }

  function handleFlatten() {
    onChange([{ category: '', items: [...new Set(allItems)] }]);
  }

  return (
    <Card className="p-6" ref={containerRef}>
      <CollapsibleSectionHeader
        title="Skills"
        sub={`${value.length} categor${value.length !== 1 ? 'ies' : 'y'}`}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onAdd={() => onChange([...value, newSkillGroup()])}
        addLabel="Add category"
        extraActions={
          <>
            {allItems.length > 0 && (
              <Btn size="sm" variant="secondary" onClick={handleCategorize} disabled={categorizing}>
                <Sparkles size={13} />
                {categorizing ? 'Categorizing…' : 'AI Categorize'}
              </Btn>
            )}
            {value.length > 1 && (
              <Btn size="sm" variant="secondary" onClick={handleFlatten}>
                <Rows3 size={13} />
                Flatten
              </Btn>
            )}
            {onReset && <ResetButton onReset={onReset} />}
          </>
        }
      />
      {categorizeError && (
        <p className="mb-3 text-xs text-red-600">
          {categorizeError}{' '}
          <button type="button" onClick={handleCategorize} className="underline">
            Try again
          </button>
        </p>
      )}
      <Collapsible open={open}>
        <EditableList<SkillGroup>
          items={value}
          onChange={onChange}
          newItem={newSkillGroup}
          emptyLabel="No skill categories yet."
          hideAddButton
          renderItem={(group, update, index) => (
            <div
              className={`space-y-2 rounded-xl transition-colors ${highlightIndex === index ? 'bg-amber-50 -m-2 p-2' : ''}`}
            >
              <FieldInput
                label="Category"
                placeholder="Languages"
                value={group.category}
                onChange={(category) => update({ ...group, category })}
              />
              <TagInput
                value={group.items}
                onChange={(items) => update({ ...group, items })}
                placeholder="React, TypeScript, Python…"
                emptyLabel="No skills added yet"
                dragGroupId={String(index)}
                onExternalTagDrop={(payload, atIndex) => {
                  const sourceIndex = Number(payload.groupId);
                  if (Number.isNaN(sourceIndex) || sourceIndex === index) return;
                  const next = value.map((g) => ({ ...g, items: [...g.items] }));
                  const removed = next[sourceIndex]?.items.splice(payload.index, 1)[0];
                  if (removed === undefined) return;
                  next[index].items.splice(atIndex, 0, removed);
                  onChange(next);
                }}
              />
            </div>
          )}
        />
      </Collapsible>
    </Card>
  );
}
