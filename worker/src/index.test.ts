// What this file is: handler-level tests for the Worker's routing and both
// endpoints, with the upstream fetch mocked so nothing leaves the machine.
// Covers the /generate behavior that existed before /extract was added (so
// the refactor that split fetch() into two handlers is provably a no-op) as
// well as /extract's own validation and forwarding.
// In plain terms: proves the proxy still routes and forwards exactly as it
// used to, and that the new file endpoint checks its input properly.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const ORIGIN = 'http://localhost:5173';

const env: Env = {
  LLM_BASE_URL: 'https://llm.example/v1',
  LLM_MODEL: 'test-text-model',
  ALLOWED_ORIGINS: ORIGIN,
  LLM_API_KEY: 'test-llm-key',
  OCR_BASE_URL: 'https://ocr.example/v1',
  OCR_MODEL: 'test-ocr-model',
  MISTRAL_API_KEY: 'test-ocr-key',
};

// Each test gets a unique IP so the module-level rate limiters (which persist
// across tests in one module instance) never leak state between cases.
let ipCounter = 0;
function req(path: string, init: RequestInit = {}): Request {
  ipCounter += 1;
  return new Request(`https://proxy.example${path}`, {
    method: 'POST',
    ...init,
    headers: {
      Origin: ORIGIN,
      'CF-Connecting-IP': `10.0.0.${ipCounter}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('routing', () => {
  it('answers a preflight with 204 without calling upstream', async () => {
    const res = await worker.fetch(req('/generate', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a disallowed origin with 403', async () => {
    const res = await worker.fetch(
      new Request('https://proxy.example/generate', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404s a non-POST method on a known path', async () => {
    const res = await worker.fetch(req('/generate', { method: 'GET' }), env);
    expect(res.status).toBe(404);
  });

  it('404s an unknown path', async () => {
    const res = await worker.fetch(req('/nope', { body: '{}' }), env);
    expect(res.status).toBe(404);
  });
});

describe('POST /generate', () => {
  it('forwards to the chat-completions endpoint and pins the model', async () => {
    const res = await worker.fetch(
      req('/generate', { body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], model: 'spoofed' }) }),
      env,
    );

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://llm.example/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-llm-key');
    // A client-supplied model is overridden, never honored.
    expect(JSON.parse(init.body as string).model).toBe('test-text-model');
  });

  it('relays the upstream status and body unchanged', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream boom', { status: 502 }));
    const res = await worker.fetch(req('/generate', { body: '{}' }), env);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('upstream boom');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await worker.fetch(req('/generate', { body: 'not json' }), env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /extract', () => {
  it('forwards a PDF to the OCR endpoint with the model pinned and the file inline', async () => {
    const res = await worker.fetch(
      req('/extract', { body: JSON.stringify({ mimeType: 'application/pdf', base64: 'QUJD' }) }),
      env,
    );

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://ocr.example/v1/ocr');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-ocr-key');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'test-ocr-model',
      document: { type: 'document_url', document_url: 'data:application/pdf;base64,QUJD' },
    });
  });

  it('sends an image in the image_url field', async () => {
    await worker.fetch(req('/extract', { body: JSON.stringify({ mimeType: 'image/png', base64: 'QUJD' }) }), env);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.document).toEqual({ type: 'image_url', image_url: 'data:image/png;base64,QUJD' });
  });

  it('rejects an unsupported file type with 415 before calling upstream', async () => {
    const res = await worker.fetch(
      req('/extract', { body: JSON.stringify({ mimeType: 'application/zip', base64: 'QUJD' }) }),
      env,
    );
    expect(res.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a body missing base64 with 400', async () => {
    const res = await worker.fetch(req('/extract', { body: JSON.stringify({ mimeType: 'application/pdf' }) }), env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await worker.fetch(req('/extract', { body: 'not json' }), env);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never sends the file to a provider upload/file API', async () => {
    await worker.fetch(req('/extract', { body: JSON.stringify({ mimeType: 'application/pdf', base64: 'QUJD' }) }), env);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('/files');
    // Inline data URI, not a multipart upload.
    expect(init.body as string).toContain('data:application/pdf;base64,');
  });
});
