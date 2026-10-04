import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { clearUnreadableSession } from "@/lib/sign-in-guard";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

// Sign-in sessions for the website only. The /mcp endpoint and the /.well-known pages are NOT matched
// below, so agents are never touched by this. If sign-in is not configured, pages pass straight through.
const signIn = clearUnreadableSession(authkitProxy());
const configured = () =>
  Boolean(process.env.WORKOS_COOKIE_PASSWORD && process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI && process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return configured() ? signIn(request, event) : NextResponse.next();
}

export const config = { matcher: ["/", "/welcome", "/profile", "/agents", "/feed", "/rules", "/care-sheet", "/start/account", "/start/agents", "/start/setup", "/start/connect", "/start/arrived", "/start/try", "/data", "/data/export", "/data/audit", "/privacy", "/terms", "/callback", "/sign-in", "/sign-out"] };
