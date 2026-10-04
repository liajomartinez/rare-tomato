import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CARE_SHEET_NAME } from "@/lib/strings";

// Small shared look for the early screens: plain, readable, large touch targets, never colour alone.
export const page: CSSProperties = { maxWidth: 640, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 };
export const card: CSSProperties = { border: "1px solid #888", borderRadius: 8, padding: "1rem", margin: "1rem 0" };
export const field: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", padding: "0.6rem", minHeight: 44, margin: "0.25rem 0 0.75rem", font: "inherit" };
export const button: CSSProperties = { minHeight: 44, padding: "0.5rem 1rem", font: "inherit", cursor: "pointer" };
export const muted: CSSProperties = { color: "#444", fontSize: "0.9rem" };

export function Nav() {
  return (
    <nav aria-label="Main" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
      <Link href="/" prefetch={false}>Home</Link>
      <Link href="/feed" prefetch={false}>What your agents did</Link>
      <Link href="/rules" prefetch={false}>Your rules</Link>
      <Link href="/profile" prefetch={false}>Your details</Link>
      <Link href="/agents" prefetch={false}>Your agents</Link>
      <Link href="/care-sheet" prefetch={false}>{CARE_SHEET_NAME}</Link>
      <Link href="/data" prefetch={false}>Settings and data</Link>
      {/* A plain link on purpose: the sign-out address must never be fetched ahead of time. */}
      <a href="/sign-out">Sign out</a>
    </nav>
  );
}

/** Shows which account is signed in, so people with more than one Google account can tell (spec 11.3). */
export function SignedInAs({ email }: { email?: string | null }) {
  if (!email) return null;
  return (
    <p style={muted}>
      Signed in as <strong>{email}</strong>. If you expected to see agents or details that are missing, you may have signed in with a different account.
    </p>
  );
}

export function Notice({ children, urgent }: { children: ReactNode; urgent?: boolean }) {
  return (
    <p role={urgent ? "alert" : "status"} style={{ ...card, margin: "0.5rem 0" }}>
      {urgent ? "Please check: " : ""}
      {children}
    </p>
  );
}
