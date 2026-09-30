type Bucket = { count: number; resetAt: number };

/** Tiny fixed-window in-memory rate limiter (single-process deployments). */
class RateLimitService {
  #buckets = new Map<string, Bucket>();

  constructor() {
    const timer = setInterval(() => this.#sweep(), 10 * 60 * 1000);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  }

  /** Returns true when the call is allowed. */
  hit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const b = this.#buckets.get(key);
    if (!b || b.resetAt < now) {
      this.#buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    b.count += 1;
    return b.count <= limit;
  }

  reset(key: string) {
    this.#buckets.delete(key);
  }

  #sweep() {
    const now = Date.now();
    for (const [k, b] of this.#buckets)
      if (b.resetAt < now) this.#buckets.delete(k);
  }
}

export const rateLimitService = new RateLimitService();

export function clientIp(
  request: Request,
  server?: { requestIP?: (r: Request) => { address: string } | null } | null,
) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    server?.requestIP?.(request)?.address ||
    "unknown"
  );
}
