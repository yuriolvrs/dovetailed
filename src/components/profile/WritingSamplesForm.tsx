// What this file is: the editable form for writing samples — free-text
// blocks that later phases will use to mimic your writing style when
// generating cover letters.
// In plain terms: where you paste examples of your own writing (like an
// old cover letter) so future AI-generated text sounds like you.

import { useState } from 'react';
import { StringList } from '../StringList';
import { FileDropzone } from '../ui/FileDropzone';
import { useFileText } from '../../lib/files/useFileText';
import { Card, Collapsible, CollapsibleSectionHeader } from '../ui/primitives';

export function WritingSamplesForm({
  value,
  onChange,
  onCommit,
}: {
  value: string[];
  onChange: (writingSamples: string[]) => void;
  onCommit: (writingSamples: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const file = useFileText('Reading that file');

  return (
    <Card className="p-6">
      <CollapsibleSectionHeader
        title="Writing Samples"
        sub="Used later to match your voice when generating a cover letter"
        open={open}
        onToggle={() => setOpen((o) => !o)}
        onAdd={() => onChange([...value, ''])}
        addLabel="Add"
      />
      <Collapsible open={open}>
        <div className="mb-3">
          <FileDropzone
            compact
            busy={file.busy}
            label="Attach a past cover letter or writing sample"
            // Committed straight away: an attached sample is a finished value,
            // not a field the user is mid-way through typing.
            onFile={(f) => file.read(f, (text) => onCommit([...value, text]))}
          />
          {file.error && <p className="text-xs text-red-600 mt-2">{file.error}</p>}
        </div>
        <StringList
          items={value}
          onChange={onChange}
          onBlurCommit={onCommit}
          placeholder="Paste a writing sample..."
          multiline
          emptyLabel="No writing samples yet."
          hideAddButton
        />
      </Collapsible>
    </Card>
  );
}
