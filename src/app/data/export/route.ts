import { dataFor } from "@/db/production";
import { downloadLimiter, tooManyDownloads } from "@/lib/rate-limit";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Downloads everything about the signed-in person as a JSON file (spec FR-H1). The person's id comes from their sign-in.
export async function GET() {
  const session = await currentSession();
  if (session.status !== "ready") return new Response("Please sign in first.", { status: 401 });
  const wait = downloadLimiter.check(`export:${session.person.id}`);
  if (wait !== null) return tooManyDownloads(wait);
  const doc = await dataFor(session.person.id).exportAll();
  return new Response(JSON.stringify(doc, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="rare-tomato-export-${doc.exported_at.slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
