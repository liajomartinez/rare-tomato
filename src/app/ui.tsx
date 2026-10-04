import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CARE_SHEET_NAME, MENU_LABEL, PRODUCT_NAME } from "@/lib/strings";

// The shared look. Every value here is a variable from tokens.css, so a change of color, size or shadow is made there, once. Screens use these
// style objects (or the classes in globals.css); none of them writes its own colors.
export const page: CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "0 var(--gutter) 2rem" };
export const card: CSSProperties = { background: "var(--card)", border: "var(--border)", boxShadow: "var(--shadow)", padding: "var(--gutter)", margin: "var(--gutter) 0" };
/** The primary or "new" card: blue border and a blue hard shadow. */
export const cardNew: CSSProperties = { ...card, borderColor: "var(--blue)", boxShadow: "var(--shadow-blue)" };
export const field: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", margin: "0.25rem 0 0.75rem" };
/** A secondary button (white, ink border, no shadow). The base look comes from globals.css; this sets the size. */
export const button: CSSProperties = { minHeight: "var(--tap)" };
/** The ONE primary button on a screen: blue fill, white text, ink border, hard ink shadow, 48px high. */
export const primaryButton: CSSProperties = {
  minHeight: "var(--tap-primary)",
  color: "#fff",
  background: "var(--blue)",
  border: "var(--border)",
  boxShadow: "var(--shadow)",
};
export const muted: CSSProperties = { color: "var(--muted)", fontSize: "var(--size-small)" };
/** Small caps labels such as "One step left" and "Connected": 12px, weight 600, letter-spacing .06em, uppercase. */
export const smallCaps: CSSProperties = { fontSize: "var(--size-label)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", margin: "1.25rem 0 0.5rem" };

/** The header row: the wordmark on the left and a Menu button on the right. The menu is a plain disclosure (no script), so it works everywhere. */
export function Nav() {
  return (
    <header className="app-header">
      <Link href="/" prefetch={false} className="wordmark">
        {PRODUCT_NAME}
      </Link>
      <details className="menu">
        <summary className="as-button">{MENU_LABEL}</summary>
        <nav aria-label="Main" className="menu-panel">
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
      </details>
    </header>
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

/** The blue banner at the top of a screen (for example "Saved as a rule. Agents that ask will see it."). */
export function Banner({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="banner">
      {children}
    </p>
  );
}
