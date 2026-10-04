import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { personForSignIn } from "@/db/production";
import { AccountDeleted, needsTermsStep, SignupsClosed, type User } from "./identity";

export const signInConfigured = () =>
  Boolean(process.env.WORKOS_COOKIE_PASSWORD && process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI && process.env.WORKOS_API_KEY && process.env.WORKOS_CLIENT_ID);

export type Session =
  | { status: "unconfigured" }
  | { status: "signed_out" }
  | { status: "signups_closed" }
  | { status: "needs_attestation"; person: User }
  | { status: "ready"; person: User };

/** Who is looking at the website right now. The person's id always comes from the sign-in, never from the browser. */
export async function currentSession(): Promise<Session> {
  if (!signInConfigured()) return { status: "unconfigured" };
  const { user } = await withAuth();
  if (!user) return { status: "signed_out" };
  let person: User;
  try {
    person = await personForSignIn({ authSubject: user.id, email: user.email });
  } catch (e) {
    if (e instanceof SignupsClosed) return { status: "signups_closed" };
    if (e instanceof AccountDeleted) return { status: "signed_out" }; // an old session after deletion: a fresh sign-in is needed
    throw e;
  }
  // Anyone who has not accepted the CURRENT Terms (and confirmed they are an adult) sees the "One quick thing" step before anything else.
  return needsTermsStep(person) ? { status: "needs_attestation", person } : { status: "ready", person };
}

/** For pages that need a fully set-up person. Anyone else is sent to sign in or to finish setup. */
export async function requireReady(): Promise<User> {
  const session = await currentSession();
  if (session.status === "signed_out" || session.status === "unconfigured") redirect("/sign-in");
  if (session.status === "signups_closed") redirect("/");
  if (session.status === "needs_attestation") redirect("/welcome");
  return session.person;
}
