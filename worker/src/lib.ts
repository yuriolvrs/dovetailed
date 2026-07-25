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
