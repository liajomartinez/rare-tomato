import type { Instrumentation } from "next";
import { logSafeError } from "./lib/safe-log";
import { SESSION_COOKIE_MAX_AGE_SECONDS } from "./lib/session-config";

// The sign-in cookie lasts 30 days, not the library's 400-day default. The library reads WORKOS_COOKIE_MAX_AGE (its documented setting), which is also set in
// the hosting settings; this fills it in at start-up if it is missing.
export function register() {
  process.env.WORKOS_COOKIE_MAX_AGE ||= String(SESSION_COOKIE_MAX_AGE_SECONDS);
}

// Called by Next for every uncaught server error (pages, route handlers, server actions, the proxy). It writes the same safe line as everywhere else:
// kind, short code, route name and time. The error's message and stack are never read here.
export const onRequestError: Instrumentation.onRequestError = (err, _request, context) => {
  logSafeError(err, `${context.routeType}:${context.routePath}`);
};
