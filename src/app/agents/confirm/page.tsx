import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { UNASSIGNED_LIFETIME_DAYS } from "@/lib/connections";
import { shortWhen, TYPE_LABEL } from "@/lib/platforms";
import { requireReady } from "@/lib/session";
import { S } from "@/lib/strings";
import { BackHeader, OnbPage } from "../../start/onb";
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
    <OnbPage header={<BackHeader href="/agents" label={S.nav.agents}>{S.agents.waitingTitle(label)}</BackHeader>}>
      <p className="caption">{S.agents.waitingBody} {S.agents.waitingData}</p>
      <section className="card card-ink card-roomy" aria-label={S.agents.waitingTitle(label)}>
        <ConfirmForm agent={waiting} existing={agents} next="/agents" button={S.agents.confirm(label)} />
        {waiting.expiresAt ? <p className="caption">{S.agents.expiry(shortWhen(waiting.expiresAt), UNASSIGNED_LIFETIME_DAYS)}</p> : null}
      </section>
      <form action={revokeAgent}>
        <input type="hidden" name="id" value={waiting.id} />
        <button type="submit" className="btn-quiet pull-left">
          This is not my agent
        </button>
      </form>
    </OnbPage>
  );
}
