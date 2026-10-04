import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// A sign-in cookie that cannot be read (for example one sealed with an older WORKOS_COOKIE_PASSWORD) or an expired seal makes the sign-in
// library throw on every request, so the person is stuck in an "authentication has expired" loop until they clear their cookies by hand
// (Lia hit this on 2026-10-03 after the cookie password was rotated). This wrapper catches that, deletes the cookie, and sends the person
// back to the same address with no cookie, which the library treats as signed out and sends to a clean sign-in.
//
// It will not loop: after one clearing it leaves a short-lived marker cookie, and if the error comes back with the marker present it is
// thrown as before. If there is no sign-in cookie at all, the error is not about a cookie and is thrown as before.

export const DEFAULT_COOKIE_NAME = "wos-session";
export const CLEARED_MARKER = "rt_session_cleared";

type Handler<R> = (request: NextRequest, event: NextFetchEvent) => R | Promise<R>;

export function clearUnreadableSession<R>(inner: Handler<R>, cookieName: string = process.env.WORKOS_COOKIE_NAME || DEFAULT_COOKIE_NAME): Handler<R | NextResponse> {
  return async (request, event) => {
    try {
      return await inner(request, event);
    } catch (error) {
      if (!request.cookies.get(cookieName) || request.cookies.get(CLEARED_MARKER)) throw error;
      const response = NextResponse.redirect(request.url);
      response.cookies.set({ name: cookieName, value: "", path: "/", maxAge: 0, expires: new Date(0) });
      response.cookies.set({ name: CLEARED_MARKER, value: "1", path: "/", maxAge: 60, httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
      response.headers.set("cache-control", "no-store");
      return response;
    }
  };
}

// The same idea for the return step of sign-in (/callback). A failed return (an expired or reused sign-in, or a stale browser cookie) used to end
// in a bare error page. Now the old sign-in cookies are cleared and the person goes to a fresh sign-in, once. If it fails again straight away
// (the marker is still there), a plain message is shown instead of sending them round again.
export const CALLBACK_FAILED_MARKER = "rt_callback_failed";

export function callbackFailureResponse(request: NextRequest, cookieName: string = process.env.WORKOS_COOKIE_NAME || DEFAULT_COOKIE_NAME): Response {
  if (request.cookies.get(CALLBACK_FAILED_MARKER)) {
    return new Response("Sign-in did not complete. Please close this tab, open the site again and try once more. If it keeps happening, tell the person who runs Rare Tomato.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  const stale = [cookieName, ...request.cookies.getAll().map((c) => c.name).filter((n) => n === "wos-auth-verifier" || n.startsWith("wos-auth-verifier-"))];
  for (const name of stale) response.cookies.set({ name, value: "", path: "/", maxAge: 0, expires: new Date(0) });
  response.cookies.set({ name: CALLBACK_FAILED_MARKER, value: "1", path: "/", maxAge: 60, httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  response.headers.set("cache-control", "no-store");
  return response;
}
