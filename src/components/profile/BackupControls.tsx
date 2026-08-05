// What this file is: the UI for exporting/importing your data as JSON and
// for deleting all local data, with a two-step confirmation and
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
} from '../../lib/backup';
import { Btn, Card, SectionTitle } from '../ui/primitives';

export function BackupControls({ onDataChanged }: { onDataChanged: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleExport() {
    setError(null);
    const backup = await exportAllData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anti-funemployment-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

  async function handleConfirmDelete() {
    await deleteAllData();
    setConfirmingDelete(false);
    setError(null);
    setMessage('All local data has been deleted.');
    onDataChanged();
  }

  return (
    <Card className="p-6">
      <SectionTitle sub="Your data lives only in this browser — export it to back up or move to another device">
        Data
      </SectionTitle>

      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
      {message && !error && <p className="mb-3 text-xs text-emerald-600">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <Btn size="sm" variant="secondary" onClick={handleExport}>
          <Upload size={13} />
          Export Data
        </Btn>
        <Btn size="sm" variant="secondary" onClick={handleImportClick}>
          <Download size={13} />
          Import Data
        </Btn>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileSelected}
        />

        {!confirmingDelete ? (
          <Btn size="sm" variant="danger" onClick={() => setConfirmingDelete(true)}>
            Delete All Data
          </Btn>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-600">Are you sure? This cannot be undone.</span>
            <Btn size="sm" onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-500 focus:ring-red-600/30">
              Yes, delete everything
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Btn>
          </div>
        )}
      </div>
    </Card>
  );
}
