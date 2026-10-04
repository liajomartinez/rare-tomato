import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { CALLBACK_FAILED_MARKER, CLEARED_MARKER, callbackFailureResponse, clearUnreadableSession } from "./sign-in-guard";

// An unreadable or expired sign-in cookie must be cleared and the person sent to a clean sign-in, never stuck in an error loop.
const request = (cookies: Record<string, string> = {}, url = "https://agent-care.example/agents") =>
  new NextRequest(url, { headers: Object.keys(cookies).length ? { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") } : {} });
const event = {} as never;
const boom = () => Promise.reject(new Error("Bad hmac value"));

describe("an unreadable sign-in cookie", () => {
  it("is deleted and the person is redirected to the same address, once", async () => {
    const res = await clearUnreadableSession(boom, "wos-session")(request({ "wos-session": "sealed-with-the-old-password" }), event);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://agent-care.example/agents");
    const set = res.headers.getSetCookie().join("\n");
    expect(set).toMatch(/wos-session=;/);
    expect(set).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(set).toContain(`${CLEARED_MARKER}=1`);
  });

  it("does not loop: if the error comes back right after clearing, it is raised as before", async () => {
    await expect(clearUnreadableSession(boom, "wos-session")(request({ "wos-session": "x", [CLEARED_MARKER]: "1" }), event)).rejects.toThrow("Bad hmac value");
  });

  it("an error with no sign-in cookie is not about a cookie, so it is raised as before", async () => {
    await expect(clearUnreadableSession(boom, "wos-session")(request(), event)).rejects.toThrow("Bad hmac value");
  });

  it("a readable session passes straight through untouched", async () => {
    const ok = new Response("fine");
    const inner = vi.fn().mockResolvedValue(ok);
    const res = await clearUnreadableSession(inner, "wos-session")(request({ "wos-session": "good" }), event);
    expect(res).toBe(ok);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("the real proxy is wrapped with it", async () => {
    const fs = await import("node:fs");
    expect(fs.readFileSync("src/proxy.ts", "utf8")).toContain("clearUnreadableSession(authkitProxy())");
  });
});

describe("a failed return from sign-in (/callback)", () => {
  const back = (cookies: Record<string, string> = {}) => request(cookies, "https://agent-care.example/callback?code=old&state=old");

  it("clears the old sign-in cookies and sends the person to a clean sign-in, once", () => {
    const res = callbackFailureResponse(back({ "wos-session": "old", "wos-auth-verifier": "a", "wos-auth-verifier-abc123": "b", other: "keep" }), "wos-session");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://agent-care.example/sign-in");
    const set = res.headers.getSetCookie().join(" | ");
    expect(set).toMatch(/wos-session=;/);
    expect(set).toMatch(/wos-auth-verifier=;/);
    expect(set).toMatch(/wos-auth-verifier-abc123=;/);
    expect(set).not.toMatch(/other=/);
    expect(set).toContain(`${CALLBACK_FAILED_MARKER}=1`);
  });

  it("does not loop: failing again straight away shows a plain message, not another redirect", async () => {
    const res = callbackFailureResponse(back({ [CALLBACK_FAILED_MARKER]: "1" }), "wos-session");
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/Sign-in did not complete/);
    expect(res.headers.get("location")).toBeNull();
  });

  it("the real callback route uses it", async () => {
    const fs = await import("node:fs");
    expect(fs.readFileSync("src/app/callback/route.ts", "utf8")).toContain("callbackFailureResponse(request)");
  });
});
