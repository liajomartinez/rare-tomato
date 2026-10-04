import { logSafeError, SafeDbError, errorCode } from "../lib/safe-log";

// Every call to the database goes through this wrapper. If a call fails, what travels on is a SafeDbError (a short code and nothing else),
// so the failed query text, its parameters and any row value cannot reach a log, an error page or a message shown to a person.

function toSafe(e: unknown): SafeDbError {
  if (e instanceof SafeDbError) return e;
  const safe = new SafeDbError(errorCode(e));
  logSafeError(safe, "database");
  return safe;
}

function wrap<T>(value: T): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  return new Proxy(value as object, {
    get(target, prop) {
      if (prop === "then" && typeof (target as { then?: unknown }).then === "function") {
        const then = (target as { then: (a: unknown, b: unknown) => unknown }).then.bind(target);
        return (onOk: unknown, onErr: unknown) =>
          then(onOk, (e: unknown) => {
            const safe = toSafe(e);
            if (typeof onErr === "function") return (onErr as (x: unknown) => unknown)(safe);
            throw safe;
          });
      }
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? (...args: unknown[]) => wrap((v as (...a: unknown[]) => unknown).apply(target, args)) : v;
    },
  }) as T;
}

export function safeDb<D extends object>(db: D): D {
  return wrap(db);
}
