// What this file is: the opt-in "suggest a rewording" action shown under a
// resume bullet. A single explicit click, not run automatically alongside
// resume generation -- fires one LLM call for this one bullet, filters the
// response through suggestBulletRewrite.ts's anti-fabrication check, and
// shows only the surviving suggestions as options the user can apply or
// dismiss. Nothing is ever applied automatically.
// In plain terms: a button that asks the AI for a couple of alternative
// ways to phrase one bullet, which you can accept, ignore, or ask again.

import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import {
  buildSuggestBulletRewritePrompt,
  filterSafeSuggestions,
  isRewriteSuggestions,
} from '../../prompts/suggestBulletRewrite';
import { generateStructured, llmErrorMessage } from '../../lib/llm';
import { Btn } from '../ui/primitives';

export function BulletRewriteSuggest({
  bulletText,
  onApply,
}: {
  bulletText: string;
  onApply: (next: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'shown' | 'error'>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSuggest() {
    if (bulletText.trim() === '') return;
    setStatus('loading');
    setError(null);
    try {
      const prompt = buildSuggestBulletRewritePrompt(bulletText);
      // See runMatching.ts's comment on the same change: openai/gpt-oss-120b's
      // own reasoning can exceed 300 tokens by itself, cutting off the
      // response before any usable content.
      const result = await generateStructured(prompt, isRewriteSuggestions, { temperature: 0.4, maxTokens: 900 });
      setSuggestions(filterSafeSuggestions(bulletText, result.suggestions));
      setStatus('shown');
    } catch (err) {
      setError(llmErrorMessage(err, 'Suggesting a rewording'));
      setStatus('error');
    }
  }

  function apply(suggestion: string) {
    onApply(suggestion);
    setStatus('idle');
    setSuggestions([]);
  }

  function dismiss() {
    setStatus('idle');
    setSuggestions([]);
  }

  if (status === 'idle') {
    return (
      <button
        type="button"
        onClick={handleSuggest}
        className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
      >
        <Sparkles size={12} />
        Suggest rewording
      </button>
    );
  }

  if (status === 'loading') {
    return <p className="text-xs text-slate-400 dark:text-slate-500">Thinking of alternatives…</p>;
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        <Btn size="sm" variant="secondary" onClick={handleSuggest}>
          Try again
        </Btn>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No suggestions that stick to what's already in this bullet.
        </p>
        <Btn size="sm" variant="secondary" onClick={dismiss}>
          Dismiss
        </Btn>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {suggestions.map((suggestion, i) => (
        <div
          key={i}
          className="flex items-start justify-between gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-2"
        >
          <span className="text-xs text-slate-700 dark:text-slate-300 break-words">{suggestion}</span>
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={() => apply(suggestion)}
              className="p-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20"
              aria-label="Use this wording"
            >
              <Check size={13} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={dismiss}
        className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
      >
        <X size={12} />
        Dismiss
      </button>
    </div>
  );
}
