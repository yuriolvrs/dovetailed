// What this file is: the shared attach-a-file control -- a dashed drop target
// that also opens a file picker on click, used everywhere a file can be
// attached (resume import, writing samples, .tex templates, accomplishment
// documents). Job postings are deliberately not among them -- those are
// paste-only.
// Validates the file before handing it up, so every caller rejects bad files
// the same way.
// In plain terms: the "drop a file here or click to browse" box.

import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Loader2, Paperclip, Upload } from 'lucide-react';
import { SUPPORTED_FILE_ACCEPT, SUPPORTED_FILE_HINT, validateFile } from '../../lib/files/readFile';

export function FileDropzone({
  onFile,
  onFiles,
  accept = SUPPORTED_FILE_ACCEPT,
  busy = false,
  busyLabel = 'Reading…',
  label = 'Drop a file here, or click to browse',
  sublabel = `${SUPPORTED_FILE_HINT} — read once, never stored`,
  compact = false,
}: {
  /** Called only with a file that passed validation. */
  onFile?: (file: File) => void;
  /** When set, several files can be picked or dropped at once; called with the ones that passed validation. */
  onFiles?: (files: File[]) => void;
  accept?: string;
  busy?: boolean;
  busyLabel?: string;
  label?: string;
  sublabel?: string;
  /** Single-line variant for tight spots (e.g. inside an existing section). */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Named for what it does rather than `accept`, which is already the prop
  // carrying the input's accept attribute.
  function acceptFile(file: File | undefined) {
    if (!file) return;
    const problem = validateFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    onFile?.(file);
  }

  // Multi-file mode: passes on every valid file and names the ones skipped,
  // so one bad file does not block the rest.
  function acceptFiles(list: FileList | null | undefined) {
    if (!onFiles) {
      acceptFile(list?.[0]);
      return;
    }
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    const problems = files.flatMap((f) => {
      const problem = validateFile(f);
      return problem ? [`${f.name}: ${problem}`] : [];
    });
    setError(problems.length > 0 ? problems.join(' ') : null);
    const valid = files.filter((f) => !validateFile(f));
    if (valid.length > 0) onFiles(valid);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    acceptFiles(e.dataTransfer.files);
  }

  // Only react to drags that actually carry a file -- a tag being dragged
  // between skill categories (see TagInput) must not light this up.
  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (!dragging) setDragging(true);
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={[
          'w-full rounded-xl border-2 border-dashed transition-all text-center',
          compact ? 'px-3 py-2.5' : 'px-4 py-6',
          busy ? 'cursor-wait opacity-60' : 'cursor-pointer',
          dragging
            ? 'border-blue-400 bg-blue-50/60 dark:border-blue-500 dark:bg-blue-500/10'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800',
        ].join(' ')}
      >
        <div className={`flex items-center justify-center gap-2 ${compact ? '' : 'flex-col gap-1.5'}`}>
          {busy ? (
            <Loader2 size={compact ? 13 : 18} className="text-slate-400 dark:text-slate-500 animate-spin" />
          ) : compact ? (
            <Paperclip size={13} className="text-slate-400 dark:text-slate-500" />
          ) : (
            <Upload size={18} className="text-slate-400 dark:text-slate-500" />
          )}
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{busy ? busyLabel : label}</span>
          {!compact && !busy && <span className="text-[11px] text-slate-400 dark:text-slate-500">{sublabel}</span>}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={Boolean(onFiles)}
        className="hidden"
        onChange={(e) => {
          acceptFiles(e.target.files);
          // Reset so picking the same file twice in a row still fires.
          e.target.value = '';
        }}
      />

      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
    </div>
  );
}
