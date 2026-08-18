// What this file is: two small browser-download helpers shared by every
// export path (.tex, .md, .docx, PDF uses window.print() instead) -- no
// server round-trip, consistent with this app's "everything stays local"
// invariant.
// In plain terms: the code that triggers a "Save As" download for a
// generated file.

/** Triggers a download of plain text content as a file. */
export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(filename, blob);
}

/** Triggers a download of a Blob that's already in its final binary form (e.g. a .docx). */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
