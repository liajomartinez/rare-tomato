// A small rate limiter for the heavy signed-in downloads (export, audit log). It keeps counts in memory, so it is best-effort: each server
// instance counts for itself. It stops a tight loop against a warm instance; the agent endpoint has a stricter, database-backed limit
// (CALLS_PER_MINUTE in mcp.ts). The key is the signed-in person's id, never anything the browser sends.

export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Returns null when allowed, or the seconds to wait. */
    check(key: string): number | null {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((windowMs - (t - recent[0])) / 1000));
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (v.every((x) => t - x >= windowMs)) hits.delete(k);
      return null;
    },
  };
}

/** Ten downloads a minute per person is plenty for a human. */
export const downloadLimiter = createLimiter(10, 60_000);

export const tooManyDownloads = (waitSeconds: number) =>
  new Response("Too many downloads. Please wait a moment and try again.", { status: 429, headers: { "retry-after": String(waitSeconds), "cache-control": "no-store" } });
