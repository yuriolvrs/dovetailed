// What this file is: unit tests for llm.ts with fetch mocked (CLAUDE.md:
// LLM calls are always mocked in tests). Confirms the proxy request is
// shaped correctly and that generateStructured retries exactly once on a
// bad first response.
// In plain terms: tests proving the app talks to the proxy correctly and
// gives a flaky AI response exactly one more chance before giving up.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generate, generateStructured } from './llm';

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
