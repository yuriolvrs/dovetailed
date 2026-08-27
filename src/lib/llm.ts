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
import { repairText } from './repairText';

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /**
   * How much chain-of-thought the model may spend before answering. This
   * model bills its reasoning against the same max_tokens budget as the
   * answer, so a long task can burn the whole budget thinking and return
   * nothing -- 'low' buys that budget back for actual output.
   * In plain terms: how long the AI is allowed to think before it starts
   * writing the answer.
   */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Aborts the in-flight request (and any pending rate-limit retry) when triggered. */
  signal?: AbortSignal;
}

/**
 * Thrown when the proxy answers successfully but with no usable content --
 * nearly always because the model hit its token budget mid-reasoning
 * (finish_reason "length") and never got as far as writing an answer. Its own
 * type so generateStructured can retry it, since it's a stochastic failure
 * rather than a permanent one.
 * In plain terms: the AI replied with nothing, usually because it ran out of
 * room to answer.
 */
export class EmptyResponseError extends Error {
  constructor(readonly finishReason?: string) {
    super(
      finishReason === 'length'
        ? 'the model ran out of room before writing an answer. The input is likely too long — shorten it and try again.'
        : 'the model returned an empty response.',
    );
    this.name = 'EmptyResponseError';
  }
}

/**
 * Thrown when the proxy itself rejects a request (bad type, too large, rate
 * limited). Carries the status and which route failed so callers can react to
 * a specific case without string-matching the message.
 * In plain terms: a failed request to our own proxy, labelled well enough to
 * turn into a useful message.
 */
export class ProxyRequestError extends Error {
  constructor(
    readonly status: number,
    readonly label: string,
    body: string,
    /** Proxy route the call went to -- '/generate' or '/extract'. A status
     *  means different things on each, so the message depends on it. */
    readonly path: string = '',
  ) {
    super(`${label} request failed: ${status} ${body}`);
    this.name = 'ProxyRequestError';
  }
}

const DEFAULT_PROXY_URL = 'http://localhost:8787';

function proxyUrl(): string {
  return (import.meta.env.VITE_PROXY_URL as string | undefined) ?? DEFAULT_PROXY_URL;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
}

// Matching/analysis can fire a burst of calls (one per requirement) that
// trips a rate limit -- either the Worker's own per-IP limiter, or the LLM
// provider's tokens-per-minute cap. Back off and retry rather than failing
// the whole pass on a transient 429.
const RATE_LIMIT_MAX_RETRIES = 4;
const RATE_LIMIT_FALLBACK_DELAYS_MS = [2000, 5000, 10000, 15000];

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
      throw new ProxyRequestError(response.status, label, await response.text(), path);
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
      reasoning_effort: options.reasoningEffort,
    },
    options.signal,
    'LLM proxy',
  )) as ChatCompletionResponse;

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new EmptyResponseError(data.choices?.[0]?.finish_reason);
  }
  // The small model occasionally mis-emits multi-byte UTF-8 for special
  // punctuation (non-breaking hyphens, smart quotes, en/em dashes), so every
  // response is repaired before anything else sees it.
  return repairText(content);
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
    return repairText(await file.text());
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
  return repairText(text);
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
  // A raw status code means nothing to the user, so the ones the proxy
  // raises get spelled out. 413 means two different things depending on the
  // route -- an attachment over the size limit, or a text request too big
  // for the model's per-minute token cap -- and calling the second one a
  // file is actively misleading, since no file is involved.
  if (err instanceof ProxyRequestError) {
    if (err.status === 415) {
      return `${label} failed: that file type can't be read. Attach a ${SUPPORTED_FILE_HINT} file.`;
    }
    if (err.status === 413) {
      return err.path === '/extract'
        ? `${label} failed: that file is too large to read.`
        : `${label} failed: the request was too big for the model's per-minute token limit. Shorten the text and try again.`;
    }
  }
  if (err instanceof Error) return `${label} failed: ${err.message}`;
  return `${label} failed: unknown error.`;
}

export async function generateStructured<T>(
  prompt: string,
  validate: (x: unknown) => x is T,
  options: GenerateOptions = {},
): Promise<T> {
  // An empty response is as retryable as a malformed one -- both are the
  // small model being flaky rather than the request being wrong -- so the
  // single retry covers the whole call, not just the parse.
  try {
    return parseJson(await generate(prompt, options), validate);
  } catch (err) {
    if (!(err instanceof JsonParseError || err instanceof EmptyResponseError)) throw err;
    return parseJson(await generate(prompt, options), validate);
  }
}
