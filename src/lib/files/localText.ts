// What this file is: reads the text out of PDF, DOCX and PPTX files inside the
// browser. PDFs go through pdf.js (loaded only when a PDF is attached); DOCX
// and PPTX are zip archives of XML, opened with the browser's own
// DecompressionStream. Returns null when a file has no usable text layer (a
// scan, a photo of a page), so the caller can fall back to the OCR provider.
// In plain terms: most resumes are read on your own computer and never sent
// to the document reader; only scans still need it.

import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { normalizeMimeType } from './readFile';

// Less text than this means the file is most likely a scan with no text
// layer, so the document reader (OCR) gets a try instead.
const MIN_LOCAL_TEXT_CHARS = 80;

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * Reads a PDF, DOCX or PPTX file's text without any network call. Returns null
 * for other types, for files that fail to parse, and for files with too little
 * text to be anything but a scan.
 * In plain terms: tries to read the file here first; null means "send it to
 * the document reader after all".
 */
export async function readTextLocally(file: File): Promise<string | null> {
  const mimeType = normalizeMimeType(file.name, file.type);
  if (mimeType !== PDF_MIME && mimeType !== DOCX_MIME && mimeType !== PPTX_MIME) return null;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text =
      mimeType === PDF_MIME
        ? await readPdfText(bytes)
        : mimeType === DOCX_MIME
          ? await readDocxText(bytes)
          : await readPptxText(bytes);
    const trimmed = text.trim();
    return trimmed.replace(/\s+/g, '').length >= MIN_LOCAL_TEXT_CHARS ? trimmed : null;
  } catch {
    // A damaged or unusual file: the document reader may still manage it.
    return null;
  }
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

async function readPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(pdfItemsToText(content.items.filter((item): item is TextItem => 'str' in item)));
    }
    return pages.join('\n\n');
  } finally {
    void task.destroy();
  }
}

/**
 * Joins pdf.js text pieces into lines. A new line starts when pdf.js marks
 * one (hasEOL) or the baseline moves; a space goes between two pieces on the
 * same line when there is a visible gap between them.
 * In plain terms: puts the scattered words of a PDF page back into lines.
 */
export function pdfItemsToText(items: Pick<TextItem, 'str' | 'transform' | 'width' | 'height' | 'hasEOL'>[]): string {
  const lines: string[] = [];
  let line = '';
  let lastY: number | null = null;
  let lastEndX: number | null = null;

  for (const item of items) {
    const x = item.transform[4] as number;
    const y = item.transform[5] as number;
    if (line && lastY !== null && Math.abs(y - lastY) > Math.max(2, item.height * 0.5)) {
      lines.push(line);
      line = '';
      lastEndX = null;
    }
    const gap = lastEndX === null ? 0 : x - lastEndX;
    if (line && gap > item.height * 0.15 && !line.endsWith(' ') && !item.str.startsWith(' ')) line += ' ';
    line += item.str;
    lastY = y;
    lastEndX = x + item.width;
    if (item.hasEOL) {
      lines.push(line);
      line = '';
      lastEndX = null;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n');
}

// ---------------------------------------------------------------------------
// DOCX / PPTX (zip archives of XML)
// ---------------------------------------------------------------------------

async function readDocxText(bytes: Uint8Array): Promise<string> {
  const entries = await readZipEntries(bytes, (name) => /^word\/(header\d*|document)\.xml$/.test(name));
  // Contact details often sit in the page header, so headers come first.
  const names = [...entries.keys()].sort((a, b) => Number(a.endsWith('document.xml')) - Number(b.endsWith('document.xml')));
  return names.map((name) => officeXmlToText(entries.get(name)!, 'w')).join('\n');
}

async function readPptxText(bytes: Uint8Array): Promise<string> {
  const entries = await readZipEntries(bytes, (name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const slideNumber = (name: string) => Number(name.match(/slide(\d+)\.xml$/)![1]);
  const names = [...entries.keys()].sort((a, b) => slideNumber(a) - slideNumber(b));
  return names.map((name) => officeXmlToText(entries.get(name)!, 'a')).join('\n\n');
}

/**
 * Pulls the visible text out of WordprocessingML ('w') or DrawingML ('a')
 * XML: one line per paragraph, run-level tabs as spaces, line breaks kept.
 * In plain terms: strips the Word/PowerPoint markup and keeps the words.
 */
export function officeXmlToText(xml: string, ns: 'w' | 'a'): string {
  const paragraph = new RegExp(`<${ns}:p[ >][\\s\\S]*?</${ns}:p>`, 'g');
  const piece = new RegExp(`<${ns}:t(?:\\s[^>]*)?>([^<]*)</${ns}:t>|<${ns}:tab/>|<${ns}:br(?:\\s[^>]*)?/>`, 'g');
  const lines: string[] = [];
  for (const [p] of xml.matchAll(paragraph)) {
    let text = '';
    for (const match of p.matchAll(piece)) {
      if (match[1] !== undefined) text += decodeXmlEntities(match[1]);
      else text += match[0].includes('tab') ? ' ' : '\n';
    }
    lines.push(text.trim());
  }
  return lines.filter(Boolean).join('\n');
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, entity: string) => {
    switch (entity) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return String.fromCodePoint(
          entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10),
        );
    }
  });
}

/**
 * Minimal zip reader: walks the central directory and returns the entries
 * whose names pass `wanted`, decoded as UTF-8. Handles stored (0) and
 * deflated (8) entries, which is all Office writes. No zip64.
 * In plain terms: opens the zip file that a .docx or .pptx really is, and
 * takes out the few files inside that hold the text.
 */
export async function readZipEntries(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('Not a zip file.');

  const decoder = new TextDecoder();
  const entries = new Map<string, string>();
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Damaged zip directory.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = bytes.slice(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, decoder.decode(data));
    else if (method === 8) entries.set(name, decoder.decode(await inflateRaw(data)));
    else throw new Error(`Unsupported zip compression method ${method}.`);
  }
  return entries;
}

async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
