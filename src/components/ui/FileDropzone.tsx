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
  accept = SUPPORTED_FILE_ACCEPT,
  busy = false,
  busyLabel = 'Reading…',
  label = 'Drop a file here, or click to browse',
  sublabel = `${SUPPORTED_FILE_HINT} — read once, never stored`,
  compact = false,
}: {
  /** Called only with a file that passed validation. */
  onFile: (file: File) => void;
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
    onFile(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    acceptFile(e.dataTransfer.files[0]);
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
            ? 'border-blue-400 bg-blue-50/60'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
        ].join(' ')}
      >
        <div className={`flex items-center justify-center gap-2 ${compact ? '' : 'flex-col gap-1.5'}`}>
          {busy ? (
            <Loader2 size={compact ? 13 : 18} className="text-slate-400 animate-spin" />
          ) : compact ? (
            <Paperclip size={13} className="text-slate-400" />
          ) : (
            <Upload size={18} className="text-slate-400" />
          )}
          <span className="text-xs font-medium text-slate-600">{busy ? busyLabel : label}</span>
          {!compact && !busy && <span className="text-[11px] text-slate-400">{sublabel}</span>}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          // Reset so picking the same file twice in a row still fires.
          e.target.value = '';
        }}
      />

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
