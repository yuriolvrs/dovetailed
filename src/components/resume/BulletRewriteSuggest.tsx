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
      const result = await generateStructured(prompt, isRewriteSuggestions, { temperature: 0.4, maxTokens: 300 });
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
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition-colors"
      >
        <Sparkles size={12} />
        Suggest rewording
      </button>
    );
  }

  if (status === 'loading') {
    return <p className="text-xs text-slate-400">Thinking of alternatives…</p>;
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-red-600">{error}</p>
        <Btn size="sm" variant="secondary" onClick={handleSuggest}>
          Try again
        </Btn>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-xs text-slate-400">
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
          className="flex items-start justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2"
        >
          <span className="text-xs text-slate-700 break-words">{suggestion}</span>
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={() => apply(suggestion)}
              className="p-1 rounded text-blue-600 hover:bg-blue-100"
              aria-label="Use this wording"
            >
              <Check size={13} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={dismiss} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700">
        <X size={12} />
        Dismiss
      </button>
    </div>
  );
}
