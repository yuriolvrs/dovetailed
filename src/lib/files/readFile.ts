// What this file is: turns a picked/dropped File into the pieces the proxy's
// /extract endpoint needs (MIME type + base64), plus the classification and
// validation that decide whether a file is readable at all and whether it
// needs the document reader or can be read locally as plain text.
// In plain terms: works out what kind of file you attached, whether we can
// read it, and converts it into something sendable.

export type FileKind = 'document' | 'image' | 'text' | 'unsupported';

export interface Attachment {
  name: string;
  mimeType: string;
  base64: string;
  size: number;
}

// Conservative until the provider's real ceiling is confirmed -- the OCR
// docs page documenting size/page limits was unreachable when this was
// written, so this is deliberately well under any plausible cap rather than
// tuned to it.
export const MAX_FILE_BYTES = 15_000_000;

const DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  avif: 'image/avif',
};

// Read in the browser and sent as text -- these never reach the OCR
// provider, so a .md or .tex file never leaves the machine at all.
const TEXT_MIME_TYPES: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  tex: 'text/plain',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Resolves the MIME type to trust for a file. Browsers report an empty string
 * or "application/octet-stream" for extensions they don't recognize (.md and
 * .tex almost always, .docx often), so a reported type is only believed when
 * it's one we actually accept -- otherwise the extension decides.
 * In plain terms: works out the real file type, since browsers frequently
 * don't know it.
 */
export function normalizeMimeType(name: string, mimeType: string): string {
  const known = [
    ...Object.values(DOCUMENT_MIME_TYPES),
    ...Object.values(IMAGE_MIME_TYPES),
    ...Object.values(TEXT_MIME_TYPES),
  ];
  if (known.includes(mimeType)) return mimeType;

  const ext = extensionOf(name);
  return DOCUMENT_MIME_TYPES[ext] ?? IMAGE_MIME_TYPES[ext] ?? TEXT_MIME_TYPES[ext] ?? mimeType;
}

/**
 * Buckets a file into how it should be read: through the document reader
 * ('document'/'image'), locally as plain text ('text'), or not at all.
 * In plain terms: decides whether we send the file off to be read, read it
 * ourselves, or reject it.
 */
export function classifyFile(name: string, mimeType: string): FileKind {
  const resolved = normalizeMimeType(name, mimeType);
  if (Object.values(DOCUMENT_MIME_TYPES).includes(resolved)) return 'document';
  if (Object.values(IMAGE_MIME_TYPES).includes(resolved)) return 'image';
  if (Object.values(TEXT_MIME_TYPES).includes(resolved)) return 'text';
  return 'unsupported';
}

/** Human-readable list of what can be attached, for empty states and errors. */
export const SUPPORTED_FILE_HINT = 'PDF, DOCX, PPTX, PNG, JPG, TXT, or MD';

/**
 * Checks a file is readable and small enough, returning a message to show the
 * user or null when it's fine.
 * In plain terms: the "we can't use this file, and here's why" check.
 */
export function validateFile(file: File): string | null {
  if (file.size === 0) {
    return `${file.name} is empty.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    const mb = (MAX_FILE_BYTES / 1_000_000).toFixed(0);
    return `${file.name} is larger than ${mb}MB. Try a smaller file.`;
  }
  if (classifyFile(file.name, file.type) === 'unsupported') {
    return `${file.name} isn't a supported file type. Attach a ${SUPPORTED_FILE_HINT} file.`;
  }
  return null;
}

// Chunked rather than a single String.fromCharCode(...bytes) spread, which
// overflows the call stack on multi-megabyte files.
// In plain terms: converts the file's raw bytes to text safely, even when the
// file is large.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Reads a file into the { mimeType, base64 } pair the proxy's /extract
 * endpoint expects. Uses arrayBuffer() rather than FileReader so the same
 * code runs under the test runner's node environment.
 * In plain terms: loads the file's contents into a form we can send.
 */
export async function readAttachment(file: File): Promise<Attachment> {
  const buffer = await file.arrayBuffer();
  return {
    name: file.name,
    mimeType: normalizeMimeType(file.name, file.type),
    base64: bytesToBase64(new Uint8Array(buffer)),
    size: file.size,
  };
}
