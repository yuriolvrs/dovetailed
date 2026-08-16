// What this file is: the one module that knows how to talk to the proxy
// (CLAUDE.md: no provider-specific code elsewhere). generate() sends a prompt
// to the Worker and returns the raw text; generateStructured() adds JSON
// parsing with one retry on failure (PRD §7); extractText() sends an attached
// file to the document reader and returns its text. Never holds an API key --
// those live only in the Worker.
// In plain terms: the app's one doorway to asking the AI something or having
// it read a file.

import { classifyFile, readAttachment, SUPPORTED_FILE_HINT } from './files/readFile';
import { JsonParseError, parseJson } from './json';

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /** Aborts the in-flight request (and any pending rate-limit retry) when triggered. */
  signal?: AbortSignal;
}

const DEFAULT_PROXY_URL = 'http://localhost:8787';

function proxyUrl(): string {
  return (import.meta.env.VITE_PROXY_URL as string | undefined) ?? DEFAULT_PROXY_URL;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

// Matching/analysis can fire a burst of calls (one per requirement) that
// trips a rate limit -- either the Worker's own per-IP limiter, or the LLM
// provider's tokens-per-minute cap. Back off and retry rather than failing
// the whole pass on a transient 429.
const RATE_LIMIT_MAX_RETRIES = 4;
const RATE_LIMIT_FALLBACK_DELAYS_MS = [2000, 5000, 10000, 15000];

// The small model this app uses occasionally mis-emits multi-byte UTF-8 for
// special punctuation (non-breaking hyphens, smart quotes, en/em dashes):
// the intended character's bytes arrive as separate Latin-1-range characters
// (code points U+0080-U+00FF) instead of one correct code point, e.g. a
// non-breaking hyphen in "cross-functional" shows up as one garbled visible
// letter followed by invisible control characters. Re-encoding each run of
// Latin-1-range characters back to raw bytes and re-decoding as UTF-8
// recovers the original character; runs that are not actually mis-decoded
// UTF-8 (e.g. a genuine standalone accented letter) fail the strict decode
// and are left untouched. Plain ASCII text never enters this path at all.
// In plain terms: repairs the garbled special characters this AI model
// sometimes produces.
const LATIN1_RANGE_RUN = new RegExp('[\u0080-\u00FF]+', 'g');

function fixMojibake(text: string): string {
  return text.replace(LATIN1_RANGE_RUN, (run) => {
    const bytes = Uint8Array.from([...run].map((c) => c.charCodeAt(0)));
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return run;
    }
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

// The provider's 429 body says exactly how long to wait (e.g. "Please try
// again in 4.31s"); honoring that is far more reliable than guessing with a
// fixed schedule, since a too-short wait just re-hits the same cap.
// In plain terms: figures out how long to pause before retrying after
// getting rate-limited.
function retryDelayMs(body: string, attempt: number): number {
  const match = body.match(/try again in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  return RATE_LIMIT_FALLBACK_DELAYS_MS[attempt] ?? RATE_LIMIT_FALLBACK_DELAYS_MS.at(-1)!;
}

// Shared POST-with-backoff used by both proxy endpoints, so /extract gets the
// same 429 handling /generate has always had instead of duplicating it.
// In plain terms: sends a request to the proxy and waits-and-retries if we're
// being rate-limited.
async function postWithRetry(
  path: string,
  body: unknown,
  signal: AbortSignal | undefined,
  label: string,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${proxyUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      await sleep(retryDelayMs(await response.text(), attempt), signal);
      continue;
    }

    if (!response.ok) {
      throw new Error(`${label} request failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }
}

export async function generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const data = (await postWithRetry(
    '/generate',
    {
      messages: [{ role: 'user', content: prompt }],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    },
    options.signal,
    'LLM proxy',
  )) as ChatCompletionResponse;

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM proxy response had no content.');
  }
  return fixMojibake(content);
}

// The document reader returns one markdown block per page; joining them in
// index order reconstructs the document's text. Shape verified against
// https://docs.mistral.ai/capabilities/OCR/basic_ocr/.
interface OcrResponse {
  pages?: { index?: number; markdown?: string }[];
}

/**
 * Reads an attached file into plain text. Text files (.txt/.md/.tex) are read
 * locally and never sent anywhere; everything else goes through the proxy to
 * the document reader. The file is sent inline and is never stored -- not by
 * the proxy, not by the provider, and not by this app.
 * In plain terms: turns an attached file into text, without the file being
 * kept anywhere.
 */
export async function extractText(file: File, options: GenerateOptions = {}): Promise<string> {
  if (classifyFile(file.name, file.type) === 'text') {
    return fixMojibake(await file.text());
  }

  const { mimeType, base64 } = await readAttachment(file);
  const data = (await postWithRetry(
    '/extract',
    { mimeType, base64 },
    options.signal,
    'Document reader',
  )) as OcrResponse;

  const pages = [...(data.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const text = pages
    .map((page) => page.markdown ?? '')
    .join('\n\n')
    .trim();

  if (!text) {
    throw new Error('The document reader found no text in that file.');
  }
  return fixMojibake(text);
}

// Every screen that runs an LLM call needs the same three-way message
// (malformed JSON / failed request / something else); `label` names the
// action, e.g. "Analysis" or "Matching".
// In plain terms: turns whatever went wrong with an AI call into one clear
// error message to show the user.
export function llmErrorMessage(err: unknown, label: string): string {
  if (err instanceof JsonParseError) {
    return `${label} failed: the model returned an unusable response. Try again — the model this app uses is small and occasionally produces malformed output.`;
  }
  if (err instanceof Error) {
    // The proxy answers 415 for a file type the document reader doesn't
    // accept; surfacing the raw status here would be meaningless to the user.
    if (err.message.includes('Document reader request failed: 415')) {
      return `${label} failed: that file type can't be read. Attach a ${SUPPORTED_FILE_HINT} file.`;
    }
    if (err.message.includes('Document reader request failed: 413')) {
      return `${label} failed: that file is too large to read.`;
    }
    return `${label} failed: ${err.message}`;
  }
  return `${label} failed: unknown error.`;
}

export async function generateStructured<T>(
  prompt: string,
  validate: (x: unknown) => x is T,
  options: GenerateOptions = {},
): Promise<T> {
  const first = await generate(prompt, options);
  try {
    return parseJson(first, validate);
  } catch {
    const retry = await generate(prompt, options);
    return parseJson(retry, validate);
  }
}
