import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";
import { PickAgents } from "./PickAgents";

export const dynamic = "force-dynamic";

// Which agent do you want to set up first? (round 9, P). One is required. Muse carries its Experimental tag and the short note.
export default async function Pick() {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/start/account");
  if (session.status === "needs_attestation") redirect("/welcome");
  return <PickAgents />;
}
