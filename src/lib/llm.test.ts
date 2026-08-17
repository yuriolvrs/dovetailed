// What this file is: unit tests for llm.ts with fetch mocked (CLAUDE.md:
// LLM calls are always mocked in tests). Confirms the proxy request is
// shaped correctly and that generateStructured retries exactly once on a
// bad first response.
// In plain terms: tests proving the app talks to the proxy correctly and
// gives a flaky AI response exactly one more chance before giving up.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractText, generate, generateStructured, llmErrorMessage, ProxyRequestError } from './llm';

interface Hello {
  hello: string;
}

function isHello(x: unknown): x is Hello {
  return typeof x === 'object' && x !== null && typeof (x as Hello).hello === 'string';
}

function chatResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => '',
  } as Response;
}

// What the model returns when its reasoning ate the whole max_tokens budget:
// a 200 with an empty content string and finish_reason "length".
function truncatedResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
    text: async () => '',
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generate', () => {
  it('POSTs the prompt to the proxy and returns the content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('hi there'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generate('say hi');

    expect(result).toBe('hi there');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8787/generate');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual([{ role: 'user', content: 'say hi' }]);
  });

  it('forwards reasoning_effort when asked for one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('hi there'));
    vi.stubGlobal('fetch', fetchMock);

    await generate('say hi', { reasoningEffort: 'low' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reasoning_effort).toBe('low');
  });

  it('explains a budget-truncated empty response instead of a bare "no content"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(truncatedResponse()));

    await expect(generate('say hi')).rejects.toThrow(/ran out of room/);
  });

  it('repairs mis-decoded UTF-8 punctuation in the content (Groq mojibake)', async () => {
    // Simulates the model emitting a non-breaking hyphen (U+2011, UTF-8
    // bytes E2 80 91) that arrives mis-decoded as three Latin-1 code points.
    const corrupted = 'cross' + String.fromCharCode(0xe2, 0x80, 0x91) + 'functional';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse(corrupted)));

    const result = await generate('say hi');

    expect(result).toBe('cross‑functional');
  });

  it('leaves genuine accented characters untouched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(chatResponse('café')));

    const result = await generate('say hi');

    expect(result).toBe('café');
  });

  it('throws when the proxy responds with a non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' } as Response),
    );

    await expect(generate('say hi')).rejects.toThrow(/500/);
  });

  it('retries after a 429 and succeeds once the rate limit clears', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Rate limit exceeded' } as Response)
      .mockResolvedValueOnce(chatResponse('hi there'));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = generate('say hi');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('hi there');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('honors the provider-specified wait time on a 429 instead of a fixed delay', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit reached... Please try again in 4.31s.',
      } as Response)
      .mockResolvedValueOnce(chatResponse('hi there'));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = generate('say hi');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe('hi there');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('generateStructured', () => {
  it('returns the parsed result on a valid first response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(chatResponse('{"hello":"world"}'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateStructured('say hi', isHello);

    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once on an invalid first response, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse('not json'))
      .mockResolvedValueOnce(chatResponse('{"hello":"world"}'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateStructured('say hi', isHello);

    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries an empty (budget-truncated) response, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(chatResponse('{"hello":"world"}'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateStructured('say hi', isHello);

    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failed request, only a bad response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateStructured('say hi', isHello)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws after the retry also fails, without a third attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(chatResponse('not json'))
      .mockResolvedValueOnce(chatResponse('still not json'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateStructured('say hi', isHello)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function ocrResponse(pages: { index?: number; markdown?: string }[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ pages }),
    text: async () => '',
  } as Response;
}

describe('extractText', () => {
  it('reads a text file locally without any network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractText(new File(['plain notes'], 'notes.md', { type: 'text/markdown' }));

    expect(result).toBe('plain notes');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs a PDF to /extract as mimeType + base64', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ocrResponse([{ index: 0, markdown: 'page one' }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractText(new File(['ABC'], 'cv.pdf', { type: 'application/pdf' }));

    expect(result).toBe('page one');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:8787/extract');
    expect(JSON.parse(init.body)).toEqual({ mimeType: 'application/pdf', base64: 'QUJD' });
  });

  it('joins pages in index order regardless of the order returned', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ocrResponse([
        { index: 1, markdown: 'second' },
        { index: 0, markdown: 'first' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await extractText(new File(['ABC'], 'cv.pdf', { type: 'application/pdf' }))).toBe('first\n\nsecond');
  });

  it('throws when the reader finds no text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ocrResponse([])));

    await expect(extractText(new File(['ABC'], 'cv.pdf', { type: 'application/pdf' }))).rejects.toThrow(
      /no text/i,
    );
  });
});

describe('llmErrorMessage', () => {
  it('translates an unsupported-file-type failure into something readable', () => {
    const message = llmErrorMessage(
      new ProxyRequestError(415, 'Document reader', 'Unsupported file type'),
      'Import',
    );
    expect(message).toContain('file type');
    expect(message).not.toContain('415');
  });

  it('translates a too-large failure into something readable', () => {
    const message = llmErrorMessage(
      new ProxyRequestError(413, 'Document reader', 'Payload too large'),
      'Import',
    );
    expect(message).toContain('too large');
    expect(message).not.toContain('413');
  });

  it('falls back to the raw message for a status it has no wording for', () => {
    const message = llmErrorMessage(new ProxyRequestError(500, 'LLM proxy', 'boom'), 'Analysis');
    expect(message).toContain('500');
  });
});
