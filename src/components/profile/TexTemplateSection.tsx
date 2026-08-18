// What this file is: the Profile page's ".tex Template" section -- lets the
// user paste a raw .tex resume template, runs the one-time LLM conversion
// into this app's placeholder syntax (PRD §9), and shows the result for
// review/editing before saving. Everything after this is deterministic code
// (src/lib/latex/fillTemplate.ts) -- the LLM is never involved again once a
// template is saved, per the "convert once, fill deterministically" design.
// Lives on the Profile page (not its own route) since it's account-level
// setup, the same category as the rest of the profile, not a per-job step.
// In plain terms: the part of your Profile where you set up a LaTeX resume
// template once, so every future job can export a filled-in .tex from it.

import { useEffect, useMemo, useState } from 'react';
import { Check, FileCode, Sparkles, Trash2 } from 'lucide-react';
import type { LatexTemplate } from '../../types';
import { deleteTemplate, loadTemplate, newTemplate, saveTemplate } from '../../lib/templateStore';
import { DEFAULT_RAW_TEX } from '../../lib/latex/defaultTemplate';
import { MAX_TEMPLATE_CHARS } from '../../prompts/convertLatexTemplate';
import { llmErrorMessage } from '../../lib/llm';
import { convertTemplate, type ConvertProgress } from '../../lib/latex/convertTemplate';
import { splitTexIntoChunks } from '../../lib/latex/splitTemplate';
import { fillLatexTemplate, TemplateSyntaxError } from '../../lib/latex/fillTemplate';
import { useFileText } from '../../lib/files/useFileText';
import { FileDropzone } from '../ui/FileDropzone';
import { Btn, Card, FieldTextarea, Skeleton, SectionTitle } from '../ui/primitives';

// onChanged fires after a save or delete, so the page around this section can
// re-read whether a template now exists.
// In plain terms: tells the Profile page when you've added or removed your
// template.
export function TexTemplateSection({ onChanged }: { onChanged?: () => void }) {
  const [template, setTemplate] = useState<LatexTemplate | null | 'none'>(null);
  const [rawTex, setRawTex] = useState('');
  const [status, setStatus] = useState<'idle' | 'converting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  // The just-converted (or just-loaded) draft the user reviews/edits before
  // saving -- kept separate from `template` (the saved copy) so an in-progress
  // edit isn't lost by re-fetching, and so "Save" is an explicit action.
  const [draft, setDraft] = useState<{ compiledTemplate: string; placeholders: string[] } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  // True right after a successful Save, cleared as soon as the draft changes
  // again (re-convert or a hand-edit) so it never claims a since-changed
  // draft is saved.
  const [justSaved, setJustSaved] = useState(false);
  // Same idea for the raw .tex box, which can be saved on its own (without
  // converting) so a pasted template survives leaving the page.
  const [rawSaved, setRawSaved] = useState(false);
  // Which chunk of a split template is in flight -- a long template takes
  // several requests, paced by the provider's per-minute cap, so a bare
  // "Converting…" would look hung.
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const texFile = useFileText('Reading that .tex file');
  // The same split the conversion will use, so the warning below reflects
  // what actually gets sent rather than a second guess at it.
  const chunks = useMemo(() => splitTexIntoChunks(rawTex), [rawTex]);

  useEffect(() => {
    loadTemplate().then((t) => {
      setTemplate(t ?? 'none');
      if (t) {
        setRawTex(t.rawTex);
        setDraft({ compiledTemplate: t.compiledTemplate, placeholders: t.placeholders });
      } else {
        // Pre-fills the paste box with a well-known sample template ("Jake's
        // Resume") so there's something to try before pasting your own --
        // purely a convenience default, nothing is auto-converted or saved.
        setRawTex(DEFAULT_RAW_TEX);
      }
    });
  }, []);

  // Re-checked whenever the draft's compiled template text changes, so a
  // hand-edit that breaks the mini template syntax (e.g. an unclosed
  // {{#each}}) is caught before the user tries to export with it.
  useEffect(() => {
    if (!draft) {
      setSyntaxError(null);
      return;
    }
    try {
      fillLatexTemplate(draft.compiledTemplate, {});
      setSyntaxError(null);
    } catch (err) {
      setSyntaxError(err instanceof TemplateSyntaxError ? err.message : 'Invalid template syntax.');
    }
  }, [draft]);

  async function handleConvert() {
    if (!rawTex.trim()) return;
    setStatus('converting');
    setError(null);
    setJustSaved(false);
    // Tracked locally as well as in state: a failure needs to name the part
    // that failed, and the state value read inside this closure would be the
    // stale one from the render that started the conversion.
    const at: { current: ConvertProgress | null } = { current: null };
    try {
      const result = await convertTemplate(rawTex, {
        onProgress: (p) => {
          at.current = p;
          setProgress(p);
        },
      });
      setDraft(result);
      setStatus('idle');
    } catch (err) {
      const where =
        at.current && at.current.total > 1 ? ` (part ${at.current.part} of ${at.current.total})` : '';
      setError(llmErrorMessage(err, `Converting your template${where}`));
      setStatus('error');
    } finally {
      setProgress(null);
    }
  }

  function updateRawTex(value: string) {
    setRawTex(value);
    setRawSaved(false);
  }

  // Persists just the pasted .tex, leaving any already-saved placeholder
  // version untouched -- so work isn't lost between pasting and converting.
  // In plain terms: saves the raw text you pasted, without running the AI.
  async function handleSaveRaw() {
    const existing = template === 'none' ? null : template;
    const saved = newTemplate(rawTex, existing?.compiledTemplate ?? '', existing?.placeholders ?? []);
    await saveTemplate(saved);
    setTemplate(saved);
    setRawSaved(true);
    onChanged?.();
  }

  async function handleSave() {
    if (!draft || syntaxError) return;
    const saved = newTemplate(rawTex, draft.compiledTemplate, draft.placeholders);
    await saveTemplate(saved);
    setTemplate(saved);
    setJustSaved(true);
    onChanged?.();
  }

  async function handleDelete() {
    await deleteTemplate();
    setTemplate('none');
    setRawTex('');
    setDraft(null);
    setConfirmingDelete(false);
    onChanged?.();
  }

  if (template === null) {
    return (
      <Card className="p-6">
        <Skeleton className="h-28 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <SectionTitle
        sub="Paste a LaTeX resume template once (e.g. from Overleaf). The AI converts it into a
        fill-in-the-blanks version; every future resume export then fills it in with your own
        code -- no AI involved after this step."
        right={
          template !== 'none' && (
            <Btn size="sm" variant="danger" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={13} />
              Remove template
            </Btn>
          )
        }
      >
        <div className="flex items-center gap-2">
          <FileCode size={16} />
          .tex Template
        </div>
      </SectionTitle>

      {confirmingDelete && (
        <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-red-200 bg-red-50">
          <span className="text-sm text-slate-600">Remove your saved LaTeX template? This can't be undone.</span>
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="danger" onClick={handleDelete}>
              Yes, remove
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      )}

      {/* A .tex file is plain text, so this is a local read -- no OCR, no
          LLM, nothing leaves the browser until Convert is clicked. */}
      <FileDropzone
        compact
        accept=".tex,.txt"
        busy={texFile.busy}
        label="Attach a .tex file, or paste below"
        onFile={(f) => texFile.read(f, updateRawTex)}
      />
      {texFile.error && <p className="text-sm text-red-600">{texFile.error}</p>}
      <FieldTextarea
        label="Raw .tex template"
        value={rawTex}
        onChange={updateRawTex}
        rows={10}
        placeholder="\documentclass{article}..."
      />
      {/* Long templates are converted in several passes, so length alone is
          fine and says nothing. The only thing worth warning about is one
          section too big to be a pass by itself, which is the single case
          the prompt still truncates. */}
      {chunks.some((c) => c.length > MAX_TEMPLATE_CHARS) && (
        <p className="text-sm text-amber-600">
          One section of this template is longer than {MAX_TEMPLATE_CHARS.toLocaleString()}{' '}
          characters, which is more than one pass can convert -- it can't be split further
          without breaking it. Converting will cut that section short; splitting it into two
          \section blocks first avoids that.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {rawSaved && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <Check size={13} />
            Saved
          </span>
        )}
        <Btn variant="secondary" onClick={handleSaveRaw} disabled={!rawTex.trim()}>
          Save .tex text
        </Btn>
        <Btn onClick={handleConvert} disabled={!rawTex.trim() || status === 'converting'}>
          <Sparkles size={13} />
          {status === 'converting'
            ? progress && progress.total > 1
              ? `Converting part ${progress.part} of ${progress.total}…`
              : 'Converting…'
            : draft
              ? 'Re-convert'
              : 'Convert to placeholder template'}
        </Btn>
      </div>

      {draft && (
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <SectionTitle sub="Review and edit the placeholder version before saving -- fix anything the conversion got wrong.">
            Placeholder template
          </SectionTitle>
          <FieldTextarea
            value={draft.compiledTemplate}
            onChange={(v) => {
              setDraft({ ...draft, compiledTemplate: v });
              setJustSaved(false);
            }}
            rows={16}
            className="font-mono text-xs"
          />
          {syntaxError && <p className="text-sm text-red-600">{syntaxError}</p>}
          <p className="text-xs text-slate-400">
            This is a starting point, not guaranteed-correct LaTeX -- the conversion can
            occasionally drop a brace from an existing command (e.g. turning \textbf{'{'}Title
            {'}'} into invalid \textbf{'{{'}title{'}}'} instead of \textbf{'{{{'}title{'}}}'}).
            Compile the exported .tex once after saving to confirm it works, and fix anything
            wrong here before relying on it.
          </p>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              Placeholders used
            </p>
            <p className="text-xs text-slate-500 font-mono break-words">
              {draft.placeholders.length > 0 ? draft.placeholders.join(', ') : 'None detected.'}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Btn onClick={handleSave} disabled={Boolean(syntaxError)}>
              Save template
            </Btn>
            {justSaved && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check size={13} />
                Saved
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
