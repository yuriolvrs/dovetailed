// What this file is: the one module that knows how to talk to the LLM
// proxy (CLAUDE.md: no provider-specific code elsewhere). generate() sends
// a prompt to the Worker and returns the raw text; generateStructured()
// adds JSON parsing with one retry on failure (PRD §7). Never holds an API
// key -- that lives only in the Worker.
// In plain terms: the app's one doorway to asking the AI something.

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

export async function generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${proxyUrl()}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      signal: options.signal,
    });

    if (response.status === 429 && attempt < RATE_LIMIT_MAX_RETRIES) {
      await sleep(retryDelayMs(await response.text(), attempt), options.signal);
      continue;
    }

    if (!response.ok) {
      throw new Error(`LLM proxy request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM proxy response had no content.');
    }
    return fixMojibake(content);
  }
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
  if (err instanceof Error) return `${label} failed: ${err.message}`;
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
