import { dataFor } from "@/db/production";
import { downloadLimiter, tooManyDownloads } from "@/lib/rate-limit";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Downloads the audit log of the signed-in person as JSON (spec FR-H4): kinds and times, never values.
export async function GET() {
  const session = await currentSession();
  if (session.status !== "ready") return new Response("Please sign in first.", { status: 401 });
  const wait = downloadLimiter.check(`audit:${session.person.id}`);
  if (wait !== null) return tooManyDownloads(wait);
  const entries = await dataFor(session.person.id).audit(5000);
  return new Response(
    JSON.stringify(entries.map((e) => ({ at: e.at.toISOString(), who: e.who, action: e.action, kinds_of_information: e.categories })), null, 2),
    { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="rare-tomato-audit-log.json"', "cache-control": "no-store" } },
  );
}
