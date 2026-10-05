import { withDb } from "@/db/production";
import { onboardingStatus } from "@/lib/onboarding-status";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const reply = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });

// GET /agents/status?agent=<id>: which of the five setup events have happened for one of the signed-in person's own agents. Read-only. The
// person always comes from the sign-in; an id that is not theirs gets the same 404 as one that does not exist. It returns times and
// yes/no facts only, never tokens, names or details. Nothing in the app calls it yet.
export async function GET(request: Request) {
  const session = await currentSession();
  if (session.status !== "ready") return reply({ error: "sign_in_needed" }, 401);
  const agent = new URL(request.url).searchParams.get("agent") ?? "";
  if (!UUID.test(agent)) return reply({ error: "not_found" }, 404);
  const status = await withDb((db) => onboardingStatus(db, session.person.id, agent));
  return status ? reply(status) : reply({ error: "not_found" }, 404);
}
