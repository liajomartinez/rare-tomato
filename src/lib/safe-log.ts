// The ONLY way the app writes an error to the logs. A line holds the error kind, a short code, the route name and the time, and nothing else:
// never the message, the stack, a query, its parameters, a row value or a request body. (A failed database call used to carry its SQL and
// parameters in the error text, which could include readable labels or rule wording.)

/** A database error with nothing in it but a short code. Every error from the database is turned into this before it can travel anywhere. */
export class SafeDbError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Database error (${code})`);
    this.name = "SafeDbError";
    this.code = code;
  }
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** A five-character Postgres error code if the error carries one (on it or on its cause), otherwise "none". Only the code is read. */
export function errorCode(e: unknown): string {
  for (const x of [e, (e as { cause?: unknown } | null)?.cause]) {
    const c = (x as { code?: unknown } | null)?.code;
    if (typeof c === "string" && SQLSTATE.test(c)) return c;
  }
  return "none";
}

export function errorKind(e: unknown): "db" | "app" {
  if (e instanceof SafeDbError) return "db";
  const name = (e as { name?: unknown } | null)?.name;
  if (name === "DrizzleQueryError" || name === "NeonDbError" || name === "DatabaseError") return "db";
  return errorCode(e) !== "none" ? "db" : "app";
}

/** One line: {"kind","code","route","at"}. Never throws. */
export function logSafeError(e: unknown, route: string, now: Date = new Date()): void {
  try {
    console.error("app-error", JSON.stringify({ kind: errorKind(e), code: errorCode(e), route: route.slice(0, 80), at: now.toISOString() }));
  } catch {
    // logging must never change what a caller gets
  }
}
