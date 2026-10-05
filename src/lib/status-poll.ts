// Polling GET /agents/status?agent=<id> while a setup screen is waiting (round 9). About every 3 seconds, only while waiting, stopping as soon as the
// answer is final, and backing off when the server says 429 (the rate limit may or may not be deployed; both work).

export const POLL_MS = 3000;
export const MAX_BACKOFF_MS = 60_000;
/** After this long with no get_rules from the agent, the check screen says "We haven't seen <agent> yet". */
export const NOT_SEEN_AFTER_MS = 2 * 60 * 1000;

/** The fields of the status response the setup screens read. */
export interface PollStatus {
  status: "unassigned" | "expired" | "active" | "revoked";
  firstGetRules: string | null;
  firstLogTask: string | null;
}

export type Watching = "confirmation" | "check";

/**
 * Is this answer final for the screen that asked? Polling stops when it is.
 *  - confirmation: the agent has signed in (anything but "unassigned" cannot be waited on any more, and "unassigned" itself is the answer we wanted).
 *  - check: both calls were seen, or the connection can no longer work (expired or removed).
 */
export function isFinal(watching: Watching, s: PollStatus): boolean {
  if (watching === "confirmation") return true;
  if (s.status === "expired" || s.status === "revoked") return true;
  return Boolean(s.firstGetRules && s.firstLogTask);
}

/** The check screen's state from a status answer: waiting (nothing seen), partial (rules read, task not reported), ready (both). */
export function checkState(s: Pick<PollStatus, "firstGetRules" | "firstLogTask">): "waiting" | "partial" | "ready" {
  if (s.firstGetRules && s.firstLogTask) return "ready";
  if (s.firstGetRules) return "partial";
  return "waiting";
}

/** The wait before the next request. After a 429 it doubles (never below the poll interval, never above a minute), or follows Retry-After if that is longer. */
export function nextDelay(current: number, outcome: { kind: "ok" } | { kind: "limited"; retryAfterSeconds?: number | null }): number {
  if (outcome.kind === "ok") return POLL_MS;
  const doubled = Math.min(MAX_BACKOFF_MS, Math.max(POLL_MS, current) * 2);
  const asked = outcome.retryAfterSeconds && outcome.retryAfterSeconds > 0 ? Math.min(MAX_BACKOFF_MS, outcome.retryAfterSeconds * 1000) : 0;
  return Math.max(doubled, asked);
}

export type FetchResult = { kind: "ok"; status: PollStatus } | { kind: "limited"; retryAfterSeconds?: number | null } | { kind: "gone" } | { kind: "error" };

/**
 * Runs the loop. `fetchStatus` asks once; `onStatus` hears every good answer; the loop stops when `isFinal` says so, when the agent is gone (404 or 401),
 * or when `stop()` is called. `wait` is injected so tests do not sleep. Returns a stop function.
 */
export function startPolling(opts: {
  watching: Watching;
  fetchStatus: () => Promise<FetchResult>;
  onStatus: (s: PollStatus) => void;
  onStop?: (why: "final" | "gone" | "stopped") => void;
  wait?: (ms: number) => Promise<void>;
}): () => void {
  let stopped = false;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  void (async () => {
    let delay = POLL_MS;
    while (!stopped) {
      const r = await opts.fetchStatus();
      if (stopped) break;
      if (r.kind === "gone") return opts.onStop?.("gone");
      if (r.kind === "ok") {
        opts.onStatus(r.status);
        if (isFinal(opts.watching, r.status)) return opts.onStop?.("final");
        delay = nextDelay(delay, { kind: "ok" });
      } else if (r.kind === "limited") {
        delay = nextDelay(delay, { kind: "limited", retryAfterSeconds: r.retryAfterSeconds });
      } else {
        delay = nextDelay(delay, { kind: "limited" });
      }
      await wait(delay);
    }
    opts.onStop?.("stopped");
  })();
  return () => {
    stopped = true;
  };
}
