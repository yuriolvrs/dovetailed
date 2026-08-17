// What this file is: pure, framework-free helper functions for the Worker's
// CORS allowlisting, payload-size limiting, and per-IP rate limiting. Kept
// separate from index.ts so they're plain, unit-testable functions with no
// Workers-runtime dependencies.
// In plain terms: the building blocks the proxy uses to decide who's
// allowed to call it, how big a request it'll accept, and how often.

export function isAllowedOrigin(origin: string | null, allowlist: string[]): boolean {
  return origin !== null && allowlist.includes(origin);
}

export interface CorsResult {
  allowed: boolean;
  headers: Record<string, string>;
}

export function buildCorsHeaders(origin: string | null, allowlist: string[]): CorsResult {
  const allowed = isAllowedOrigin(origin, allowlist);
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return { allowed, headers };
}

export function isOversized(bodyText: string, maxBytes: number): boolean {
  return new TextEncoder().encode(bodyText).length > maxBytes;
}

// The OCR provider splits its input by kind: PDF/DOCX/PPTX go in a
// `document_url` field and images in an `image_url` field, both as base64
// data URIs rather than uploads -- uploading would persist the file on the
// provider's side, which the privacy contract forbids (PRD §10). Verified
// against https://docs.mistral.ai/capabilities/OCR/basic_ocr/ -- re-verify
// if the provider changes.
// In plain terms: the file types the document reader accepts, split into
// "documents" and "images" because the API wants them in different fields.
// Sets rather than arrays so membership is a lookup and no `as readonly
// string[]` cast is needed to test an arbitrary incoming MIME type.
export const OCR_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export const OCR_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/avif']);

export type OcrDocument =
  | { type: 'document_url'; document_url: string }
  | { type: 'image_url'; image_url: string };

/**
 * Builds the `document` field of an OCR request from a file's MIME type and
 * base64 payload, or returns null if the type isn't one the reader accepts.
 * In plain terms: wraps an uploaded file in the shape the document reader
 * expects, or says "I can't read this kind of file".
 */
export function buildOcrDocument(mimeType: string, base64: string): OcrDocument | null {
  const dataUri = `data:${mimeType};base64,${base64}`;
  if (OCR_DOCUMENT_MIME_TYPES.has(mimeType)) {
    return { type: 'document_url', document_url: dataUri };
  }
  if (OCR_IMAGE_MIME_TYPES.has(mimeType)) {
    return { type: 'image_url', image_url: dataUri };
  }
  return null;
}

export interface ExtractRequest {
  mimeType: string;
  base64: string;
}

/**
 * Structural check on the client's /extract body. The client sends only a
 * MIME type and a base64 payload, so it can neither choose the model nor
 * smuggle extra provider parameters -- the same "the proxy decides" rule
 * /generate already enforces.
 * In plain terms: makes sure the request really is just "here's a file",
 * nothing more.
 */
export function isExtractRequest(body: unknown): body is ExtractRequest {
  if (typeof body !== 'object' || body === null) return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.mimeType === 'string' &&
    candidate.mimeType.length > 0 &&
    typeof candidate.base64 === 'string' &&
    candidate.base64.length > 0
  );
}

/**
 * Best-effort, in-memory fixed-window rate limiter. Resets on cold start and
 * is per-isolate, not global across Cloudflare's edge -- this is basic abuse
 * dampening, not a hard guarantee. A KV- or Durable-Object-backed limiter
 * (or Cloudflare's Rate Limiting binding) is the upgrade path if stronger
 * enforcement is needed later.
 *
 * In plain terms: caps how many requests one IP can make in a given time
 * window, as a simple first line of defense against abuse.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly maxRequests: number,
  ) {}

  check(key: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      this.sweep(now);
      return true;
    }
    if (entry.count >= this.maxRequests) {
      return false;
    }
    entry.count += 1;
    return true;
  }

  // Drops expired entries so IPs that hit the endpoint once don't stay in
  // memory for the life of the isolate.
  private sweep(now: number): void {
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) {
        this.hits.delete(key);
      }
    }
  }
}
