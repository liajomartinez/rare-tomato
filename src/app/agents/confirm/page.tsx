import Link from "next/link";
import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { UNASSIGNED_LIFETIME_DAYS } from "@/lib/connections";
import { shortWhen, TYPE_LABEL } from "@/lib/platforms";
import { requireReady } from "@/lib/session";
import { S } from "@/lib/strings";
import { Narrow } from "../../start/parts";
import { ConfirmForm } from "../ConfirmForm";
import { revokeAgent } from "../actions";

export const dynamic = "force-dynamic";

// Waiting to connect (SPEC 4e): an agent has signed in but has not been confirmed. Until the person confirms it, it can use none of their rules or
// details (the server refuses everything except its harmless status call). The confirm form also asks what the person calls it (owner decision 11).
export default async function Confirm({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const person = await requireReady();
  const { agent: id } = await searchParams;
  const agents = await agentsFor(person.id).list();
  const waiting = agents.find((a) => a.id === id && a.status === "unassigned");
  if (!waiting) redirect("/agents");
  const label = waiting.suggestedType ? TYPE_LABEL[waiting.suggestedType] : "agent";
  return (
    <Narrow>
      <div>
        <Link href="/agents" prefetch={false} className="btn btn-quiet pull-left">
          {"←"} {S.nav.agents}
        </Link>
      </div>
      <section className="card card-ink card-roomy" aria-label={S.agents.waitingTitle(label)}>
        <div className="stack stack-3">
          <h1>{S.agents.waitingTitle(label)}</h1>
          <p className="lead">{S.agents.waitingBody}</p>
          <p className="caption">{S.agents.waitingData}</p>
        </div>
        <ConfirmForm agent={waiting} existing={agents} next="/agents" button={S.agents.confirm(label)} />
        {waiting.expiresAt ? <p className="caption">{S.agents.expiry(shortWhen(waiting.expiresAt), UNASSIGNED_LIFETIME_DAYS)}</p> : null}
      </section>
      <form action={revokeAgent}>
        <input type="hidden" name="id" value={waiting.id} />
        <button type="submit" className="btn-quiet pull-left">
          This is not my agent
        </button>
      </form>
    </Narrow>
  );
}
