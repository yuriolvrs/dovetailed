// What this file is: the Worker's entry point -- two POST endpoints,
// /generate (text prompt to the LLM provider) and /extract (an attached file
// to the OCR provider). Both check CORS/rate-limit/payload-size via lib.ts,
// forward with the secret key injected server-side, and relay the provider's
// response back unchanged. Stateless: no logging or storage of
// request/response bodies (PRD §8).
// In plain terms: the proxy server the app talks to instead of calling the
// AI providers directly, so the app never has to hold an API key.

import { buildCorsHeaders, buildOcrDocument, isExtractRequest, isOversized, RateLimiter } from './lib';

export interface Env {
  LLM_BASE_URL: string;
  LLM_MODEL: string;
  ALLOWED_ORIGINS: string;
  LLM_API_KEY: string;
  OCR_BASE_URL: string;
  OCR_MODEL: string;
  MISTRAL_API_KEY: string;
}

const MAX_BODY_BYTES = 100_000;
// An attached file arrives base64-encoded, which inflates it by ~33%, so
// /extract needs a far larger ceiling than a text prompt. Deliberately a
// separate constant from MAX_BODY_BYTES so raising this can never loosen
// the text endpoint.
const MAX_EXTRACT_BODY_BYTES = 22_000_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
// A single "re-run matching" pass fires one verification call per
// requirement (plus a retry on any malformed JSON reply), so a posting with
// 15+ requirements can burst past 20 requests/min on its own -- raised to
// give normal use headroom while still bounding abuse.
const RATE_LIMIT_MAX_REQUESTS = 60;
// File reads are heavy and human-paced (one per upload), so they get their
// own much tighter bucket instead of sharing the burst headroom matching
// needs.
const EXTRACT_RATE_LIMIT_MAX_REQUESTS = 12;

const rateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);
const extractRateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, EXTRACT_RATE_LIMIT_MAX_REQUESTS);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowlist = env.ALLOWED_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cors = buildCorsHeaders(origin, allowlist);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors.headers });
    }

    if (!cors.allowed) {
      return new Response('Forbidden origin', { status: 403, headers: cors.headers });
    }

    // The method check is separate from the path check so an unknown path
    // and a wrong method both 404 while each known path stays reachable.
    const url = new URL(request.url);
    if (request.method !== 'POST') {
      return new Response('Not found', { status: 404, headers: cors.headers });
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    if (url.pathname === '/generate') {
      return handleGenerate(request, env, cors.headers, ip);
    }
    if (url.pathname === '/extract') {
      return handleExtract(request, env, cors.headers, ip);
    }
    return new Response('Not found', { status: 404, headers: cors.headers });
  },
};

// Forwards a chat-completion request to the text provider with the key
// injected server-side. Logic unchanged since Phase 2 -- it only moved out of
// fetch() so a second route could coexist.
// In plain terms: the original "ask the AI a text question" path.
async function handleGenerate(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  ip: string,
): Promise<Response> {
  if (!rateLimiter.check(ip)) {
    return new Response('Rate limit exceeded', { status: 429, headers: cors });
  }

  const bodyText = await request.text();
  if (isOversized(bodyText, MAX_BODY_BYTES)) {
    return new Response('Payload too large', { status: 413, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: cors });
  }

  const upstream = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    // The proxy always sets the model itself -- the client can't choose
    // or spoof a different one.
    body: JSON.stringify({ ...body, model: env.LLM_MODEL }),
  });

  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Forwards an attached file to the OCR provider for transcription. The client
// sends only a MIME type and base64 payload; this builds the provider request
// around it, so the model can't be chosen or spoofed -- the same rule
// /generate enforces. The file goes inline as a data URI and never through a
// provider file-upload API, so nothing is persisted provider-side (PRD §10).
// The raw provider response is relayed unparsed, keeping provider-shape
// knowledge in the frontend's one LLM module.
// In plain terms: hands an uploaded file to the document reader and passes
// its answer straight back, without storing the file anywhere.
async function handleExtract(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  ip: string,
): Promise<Response> {
  if (!extractRateLimiter.check(ip)) {
    return new Response('Rate limit exceeded', { status: 429, headers: cors });
  }

  const bodyText = await request.text();
  if (isOversized(bodyText, MAX_EXTRACT_BODY_BYTES)) {
    return new Response('Payload too large', { status: 413, headers: cors });
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: cors });
  }

  if (!isExtractRequest(body)) {
    return new Response('Invalid extract request', { status: 400, headers: cors });
  }

  const document = buildOcrDocument(body.mimeType, body.base64);
  if (!document) {
    return new Response('Unsupported file type', { status: 415, headers: cors });
  }

  const upstream = await fetch(`${env.OCR_BASE_URL}/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({ model: env.OCR_MODEL, document }),
  });

  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
