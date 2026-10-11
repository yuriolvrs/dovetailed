// What this file is: the UI for exporting/importing your data as JSON, and
// (separately) for deleting all local data, with a two-step confirmation and
// error/success messaging.
// In plain terms: the buttons for backing up, restoring, or wiping your
// data.

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import {
  BackupValidationError,
  deleteAllData,
  exportAllData,
  importAllData,
  parseBackup,
  serializeBackup,
} from '../../lib/backup';
import { Btn, Card, SectionTitle } from '../ui/primitives';

export function BackupControls({ onDataChanged }: { onDataChanged: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    const backup = await exportAllData();
    const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dovetailed-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Exported.');
  }

  function handleImportClick() {
    setError(null);
    setMessage(null);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    try {
      const text = await file.text();
      const backup = parseBackup(text);
      await importAllData(backup);
      setMessage('Import complete. Your data has been restored.');
      onDataChanged();
    } catch (err) {
      setError(err instanceof BackupValidationError ? err.message : 'Import failed.');
    }
  }

  return (
    <Card className="p-6">
      <SectionTitle sub="Your data lives only in this browser. Download a copy to keep it safe or move it to another device">
        Backups
      </SectionTitle>

      {error && <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {message && !error && <p className="mb-3 text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <Btn size="sm" variant="secondary" onClick={handleExport}>
          <Upload size={13} />
          Download backup
        </Btn>
        <Btn size="sm" variant="secondary" onClick={handleImportClick}>
          <Download size={13} />
          Restore from file
        </Btn>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
    </Card>
  );
}

/**
 * Delete-all, in its own section so it never sits beside a routine action.
 * Two-step: the first click asks, the second deletes.
 * In plain terms: the button that wipes everything from this browser.
 */
export function DeleteAllControls({ onDataChanged }: { onDataChanged: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleConfirmDelete() {
    await deleteAllData();
    setConfirmingDelete(false);
    setMessage('All local data has been deleted.');
    onDataChanged();
  }

  return (
    <Card className="p-6">
      <SectionTitle sub="Removes your profile, jobs and documents from this browser. Download a backup first if you may want them back">
        Delete everything
      </SectionTitle>
      {message && <p className="mb-3 text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
      {!confirmingDelete ? (
        <Btn size="sm" variant="danger" onClick={() => setConfirmingDelete(true)}>
          Delete all data…
        </Btn>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-600 dark:text-slate-300">Are you sure? This cannot be undone.</span>
          <Btn size="sm" variant="dangerSolid" onClick={handleConfirmDelete}>
            Yes, delete everything
          </Btn>
          <Btn size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Btn>
        </div>
      )}
    </Card>
  );
}
