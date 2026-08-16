// What this file is: unit tests for lib.ts's pure functions -- CORS
// allow/deny decisions, oversized-payload detection, the rate limiter's
// allow/block/reset behavior over time, and the /extract request guard and
// OCR document builder.
// In plain terms: tests proving the proxy's basic protections actually
// work as intended.

import { describe, expect, it } from 'vitest';
import {
  buildCorsHeaders,
  buildOcrDocument,
  isAllowedOrigin,
  isExtractRequest,
  isOversized,
  RateLimiter,
} from './lib';

describe('isAllowedOrigin', () => {
  it('allows an origin in the allowlist', () => {
    expect(isAllowedOrigin('http://localhost:5173', ['http://localhost:5173'])).toBe(true);
  });

  it('rejects an origin not in the allowlist', () => {
    expect(isAllowedOrigin('http://evil.example', ['http://localhost:5173'])).toBe(false);
  });

  it('rejects a null origin', () => {
    expect(isAllowedOrigin(null, ['http://localhost:5173'])).toBe(false);
  });
});

describe('buildCorsHeaders', () => {
  it('includes Access-Control-Allow-Origin for an allowed origin', () => {
    const result = buildCorsHeaders('http://localhost:5173', ['http://localhost:5173']);
    expect(result.allowed).toBe(true);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });

  it('omits Access-Control-Allow-Origin for a disallowed origin', () => {
    const result = buildCorsHeaders('http://evil.example', ['http://localhost:5173']);
    expect(result.allowed).toBe(false);
    expect(result.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('isOversized', () => {
  it('accepts a body under the limit', () => {
    expect(isOversized('a'.repeat(100), 1000)).toBe(false);
  });

  it('rejects a body over the limit', () => {
    expect(isOversized('a'.repeat(1001), 1000)).toBe(true);
  });
});

describe('buildOcrDocument', () => {
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  it('puts a PDF in the document_url field as a data URI', () => {
    expect(buildOcrDocument('application/pdf', 'QUJD')).toEqual({
      type: 'document_url',
      document_url: 'data:application/pdf;base64,QUJD',
    });
  });

  it('puts DOCX and PPTX in the document_url field', () => {
    expect(buildOcrDocument(DOCX, 'QUJD')?.type).toBe('document_url');
    expect(buildOcrDocument(PPTX, 'QUJD')?.type).toBe('document_url');
  });

  it('puts images in the image_url field instead', () => {
    expect(buildOcrDocument('image/png', 'QUJD')).toEqual({
      type: 'image_url',
      image_url: 'data:image/png;base64,QUJD',
    });
    expect(buildOcrDocument('image/jpeg', 'QUJD')?.type).toBe('image_url');
  });

  it('returns null for a type the reader does not accept', () => {
    expect(buildOcrDocument('application/zip', 'QUJD')).toBeNull();
    expect(buildOcrDocument('text/plain', 'QUJD')).toBeNull();
    expect(buildOcrDocument('', 'QUJD')).toBeNull();
  });
});

describe('isExtractRequest', () => {
  it('accepts a well-formed request', () => {
    expect(isExtractRequest({ mimeType: 'application/pdf', base64: 'QUJD' })).toBe(true);
  });

  it('ignores extra fields rather than trusting them', () => {
    // The handler only ever reads mimeType/base64, so a client that tries to
    // smuggle a model past the proxy still gets the proxy's own model.
    expect(isExtractRequest({ mimeType: 'application/pdf', base64: 'QUJD', model: 'evil' })).toBe(true);
  });

  it('rejects missing, empty, or non-string fields', () => {
    expect(isExtractRequest({ mimeType: 'application/pdf' })).toBe(false);
    expect(isExtractRequest({ base64: 'QUJD' })).toBe(false);
    expect(isExtractRequest({ mimeType: 'application/pdf', base64: '' })).toBe(false);
    expect(isExtractRequest({ mimeType: '', base64: 'QUJD' })).toBe(false);
    expect(isExtractRequest({ mimeType: 1, base64: 'QUJD' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isExtractRequest(null)).toBe(false);
    expect(isExtractRequest('nope')).toBe(false);
    expect(isExtractRequest(undefined)).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('allows requests up to the limit within the window', () => {
    const limiter = new RateLimiter(60_000, 3);
    expect(limiter.check('ip1', 0)).toBe(true);
    expect(limiter.check('ip1', 1)).toBe(true);
    expect(limiter.check('ip1', 2)).toBe(true);
  });

  it('blocks requests once the limit is exceeded within the window', () => {
    const limiter = new RateLimiter(60_000, 3);
    limiter.check('ip1', 0);
    limiter.check('ip1', 1);
    limiter.check('ip1', 2);
    expect(limiter.check('ip1', 3)).toBe(false);
  });

  it('resets the count once the window has elapsed', () => {
    const limiter = new RateLimiter(60_000, 1);
    expect(limiter.check('ip1', 0)).toBe(true);
    expect(limiter.check('ip1', 30_000)).toBe(false);
    expect(limiter.check('ip1', 60_001)).toBe(true);
  });

  it('tracks separate keys independently', () => {
    const limiter = new RateLimiter(60_000, 1);
    expect(limiter.check('ip1', 0)).toBe(true);
    expect(limiter.check('ip2', 0)).toBe(true);
  });
});
