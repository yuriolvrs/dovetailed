// What this file is: the shared "attach a file, get its text back" hook used
// by every simple attach point (writing samples, additional info, supporting
// job documents, .tex templates). Owns the busy/error state so each of those
// spots handles a failed read identically instead of inventing its own.
// In plain terms: the small bit of shared logic behind every "attach a file"
// button that just needs the file's words.

import { useState } from 'react';
import { extractText, llmErrorMessage } from '../llm';

export function useFileText(label: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Reads the file and hands its text to `onText`. Errors are captured into
   * `error` rather than thrown, since every caller renders them the same way.
   * In plain terms: reads the file, and on failure shows a message instead of
   * breaking the page.
   */
  async function read(file: File, onText: (text: string) => void) {
    setBusy(true);
    setError(null);
    try {
      const text = await extractText(file);
      if (text.trim()) onText(text.trim());
    } catch (err) {
      setError(llmErrorMessage(err, label));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, read };
}
