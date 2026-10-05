import { describe, expect, it } from "vitest";
import { checkState, isFinal, MAX_BACKOFF_MS, nextDelay, POLL_MS, startPolling, type FetchResult, type PollStatus } from "./status-poll";

const st = (o: Partial<PollStatus> = {}): PollStatus => ({ status: "active", firstGetRules: null, firstLogTask: null, ...o });

describe("status polling", () => {
  it("polls about every 3 seconds", () => {
    expect(POLL_MS).toBe(3000);
    expect(nextDelay(9000, { kind: "ok" })).toBe(POLL_MS);
  });

  it("backs off on 429: doubles each time, and never goes past a minute", () => {
    let d = POLL_MS;
    d = nextDelay(d, { kind: "limited" });
    expect(d).toBe(6000);
    d = nextDelay(d, { kind: "limited" });
    expect(d).toBe(12000);
    for (let i = 0; i < 10; i++) d = nextDelay(d, { kind: "limited" });
    expect(d).toBe(MAX_BACKOFF_MS);
  });

  it("follows Retry-After when it asks for longer", () => {
    expect(nextDelay(POLL_MS, { kind: "limited", retryAfterSeconds: 30 })).toBe(30000);
  });

  it("the check is final only when both calls were seen, or the connection can no longer work", () => {
    expect(isFinal("check", st())).toBe(false);
    expect(isFinal("check", st({ firstGetRules: "x" }))).toBe(false);
    expect(isFinal("check", st({ firstGetRules: "x", firstLogTask: "y" }))).toBe(true);
    expect(isFinal("check", st({ status: "expired" }))).toBe(true);
    expect(isFinal("check", st({ status: "revoked" }))).toBe(true);
    expect(checkState(st())).toBe("waiting");
    expect(checkState(st({ firstGetRules: "x" }))).toBe("partial");
    expect(checkState(st({ firstLogTask: "y" }))).toBe("waiting");
    expect(checkState(st({ firstGetRules: "x", firstLogTask: "y" }))).toBe("ready");
  });

  it("stops asking once the answer is final, and waits longer after a 429", async () => {
    const answers: FetchResult[] = [
      { kind: "ok", status: st() },
      { kind: "limited" },
      { kind: "ok", status: st({ firstGetRules: "x" }) },
      { kind: "ok", status: st({ firstGetRules: "x", firstLogTask: "y" }) },
      { kind: "ok", status: st({ firstGetRules: "x", firstLogTask: "y" }) },
    ];
    let asked = 0;
    const waits: number[] = [];
    const seen: PollStatus[] = [];
    await new Promise<void>((done) => {
      startPolling({
        watching: "check",
        fetchStatus: async () => answers[asked++],
        onStatus: (s) => seen.push(s),
        onStop: () => done(),
        wait: async (ms) => void waits.push(ms),
      });
    });
    expect(asked).toBe(4); // the fifth answer is never asked for
    expect(waits).toEqual([POLL_MS, 6000, POLL_MS]);
    expect(seen).toHaveLength(3);
  });

  it("stops when the agent is gone (401 or 404) and when told to", async () => {
    let asked = 0;
    const why = await new Promise<string>((done) => {
      startPolling({ watching: "check", fetchStatus: async () => (asked++ === 0 ? { kind: "gone" } : { kind: "error" }), onStatus: () => {}, onStop: done, wait: async () => {} });
    });
    expect(why).toBe("gone");
    expect(asked).toBe(1);

    let n = 0;
    let stop: () => void = () => {};
    const why2 = await new Promise<string>((done) => {
      stop = startPolling({
        watching: "check",
        fetchStatus: async () => {
          if (++n === 2) stop();
          return { kind: "ok", status: st() };
        },
        onStatus: () => {},
        onStop: done,
        wait: async () => {},
      });
    });
    expect(why2).toBe("stopped");
    expect(n).toBe(2);
  });
});
