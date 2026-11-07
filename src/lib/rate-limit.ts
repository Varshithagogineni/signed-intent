/**
 * Small in-memory rate limiter for the AI routes, so a public demo can't burn through the
 * model quota. Per process, which is fine for a single Render instance.
 */

export interface Limit {
  max: number;
  windowMs: number;
}

export const LIMITS = {
  chat: { max: 30, windowMs: 10 * 60_000 },
  analyze: { max: 10, windowMs: 10 * 60_000 },
  /** Actions that move sandbox money or call PayPal: dispute responses, sync, revoke. */
  actions: { max: 20, windowMs: 10 * 60_000 },
  /** Across all callers, so many visitors together can't exhaust the daily model quota. */
  global: { max: 500, windowMs: 24 * 60 * 60_000 },
} satisfies Record<string, Limit>;

/** Sliding-window counter keyed by caller. Returns how long to wait, or 0 if allowed. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly limit: Limit) {}

  check(key: string, now = Date.now()): number {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.limit.windowMs);
    if (recent.length >= this.limit.max) {
      this.hits.set(key, recent);
      return recent[0] + this.limit.windowMs - now;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return 0;
  }
}

const limiters = new Map<keyof typeof LIMITS, RateLimiter>();

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
function limiter(name: keyof typeof LIMITS): RateLimiter {
  let found = limiters.get(name);
  if (!found) limiters.set(name, (found = new RateLimiter(LIMITS[name])));
  return found;
}

export function rateLimit(req: Request, name: Exclude<keyof typeof LIMITS, "global">): Response | null {
  const waitMs = limiter(name).check(clientKey(req)) || limiter("global").check("all");
  if (waitMs === 0) return null;
  const seconds = Math.ceil(waitMs / 1000);
  return Response.json(
    { error: `Demo limit reached. Please wait ${seconds} seconds and try again.` },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}
