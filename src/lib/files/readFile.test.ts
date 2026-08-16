// What this file is: unit tests for readFile.ts -- file-type classification
// (including the extension fallback browsers force on us), validation
// messages, and base64 conversion.
// In plain terms: tests proving we correctly work out what kind of file was
// attached and reject the ones we can't read.

import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  MAX_FILE_BYTES,
  normalizeMimeType,
  readAttachment,
  validateFile,
} from './readFile';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fileOf(name: string, type: string, contents = 'hello'): File {
  return new File([contents], name, { type });
}

describe('classifyFile', () => {
  it('buckets documents, images, and text by their reported MIME type', () => {
    expect(classifyFile('cv.pdf', 'application/pdf')).toBe('document');
    expect(classifyFile('cv.docx', DOCX)).toBe('document');
    expect(classifyFile('shot.png', 'image/png')).toBe('image');
    expect(classifyFile('shot.jpg', 'image/jpeg')).toBe('image');
    expect(classifyFile('notes.txt', 'text/plain')).toBe('text');
  });

  it('rejects types the reader cannot handle', () => {
    expect(classifyFile('archive.zip', 'application/zip')).toBe('unsupported');
    expect(classifyFile('sheet.xlsx', 'application/vnd.ms-excel')).toBe('unsupported');
  });
});

describe('normalizeMimeType (browser reports the wrong type constantly)', () => {
  it('falls back to the extension when the browser reports nothing', () => {
    expect(normalizeMimeType('resume.pdf', '')).toBe('application/pdf');
    expect(normalizeMimeType('notes.md', '')).toBe('text/markdown');
    expect(normalizeMimeType('template.tex', '')).toBe('text/plain');
  });

  it('falls back to the extension when the browser reports octet-stream', () => {
    expect(normalizeMimeType('resume.docx', 'application/octet-stream')).toBe(DOCX);
  });

  it('keeps a reported type we already accept', () => {
    expect(normalizeMimeType('resume.pdf', 'application/pdf')).toBe('application/pdf');
  });

  it('classifies .md and .tex as text so they never leave the browser', () => {
    expect(classifyFile('notes.md', '')).toBe('text');
    expect(classifyFile('template.tex', '')).toBe('text');
    expect(classifyFile('resume.docx', 'application/octet-stream')).toBe('document');
  });
});

describe('validateFile', () => {
  it('accepts a normal supported file', () => {
    expect(validateFile(fileOf('cv.pdf', 'application/pdf'))).toBeNull();
  });

  it('rejects an empty file', () => {
    const empty = new File([], 'cv.pdf', { type: 'application/pdf' });
    expect(validateFile(empty)).toContain('empty');
  });

  it('rejects an unsupported type by name', () => {
    const message = validateFile(fileOf('archive.zip', 'application/zip'));
    expect(message).toContain('archive.zip');
    expect(message).toContain('supported file type');
  });

  it('rejects a file over the size cap', () => {
    const big = fileOf('huge.pdf', 'application/pdf');
    // Size is read-only on File, so stub just that property.
    Object.defineProperty(big, 'size', { value: MAX_FILE_BYTES + 1 });
    expect(validateFile(big)).toContain('larger than');
  });
});

describe('readAttachment', () => {
  it('converts contents to base64 and resolves the MIME type', async () => {
    const attachment = await readAttachment(fileOf('cv.pdf', '', 'ABC'));
    expect(attachment.base64).toBe('QUJD'); // "ABC"
    expect(attachment.mimeType).toBe('application/pdf');
    expect(attachment.name).toBe('cv.pdf');
  });

  it('handles a payload larger than one conversion chunk without overflowing', async () => {
    // 0x8000 is the chunk size; going well past it catches a naive
    // String.fromCharCode(...bytes) spread blowing the call stack.
    const big = 'a'.repeat(0x8000 * 3 + 17);
    const attachment = await readAttachment(fileOf('cv.pdf', 'application/pdf', big));
    expect(attachment.base64).toBe(btoa(big));
  });
});
