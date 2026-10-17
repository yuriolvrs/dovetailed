// What this file is: test setup for the evaluation harness. It wraps global fetch so requests to
// the proxy carry an allowed Origin header (the proxy rejects requests without one).
// In plain terms: makes our script look like the local dev app to the proxy, so it answers.

const DEFAULT_ORIGIN = 'http://localhost:5173';

const proxyUrl = (import.meta.env.VITE_PROXY_URL as string | undefined) ?? '';
const origin = process.env.EVAL_ORIGIN ?? DEFAULT_ORIGIN;
const realFetch = globalThis.fetch;

globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (proxyUrl && url.startsWith(proxyUrl)) {
    const headers = new Headers(init?.headers);
    headers.set('Origin', origin);
    return realFetch(input, { ...init, headers });
  }
  return realFetch(input, init);
};
