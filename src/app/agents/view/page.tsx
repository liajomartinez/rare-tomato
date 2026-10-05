import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { needsFinishSetup } from "@/lib/onboarding";
import { MUSE_EXPIRED } from "@/lib/onboarding-copy";
import { shortDate, TYPE_LABEL } from "@/lib/platforms";
import { requireReady } from "@/lib/session";
import { finishBody, NO_CALLS_YET, S, TIMED_OUT_BODY } from "@/lib/strings";
import { BackHeader, OnbPage } from "../../start/onb";
import { StatusIcon, Tag } from "../../ui";
import { ChangeSettings } from "../ChangeSettings";
import { reconnectAgent, removeAgent } from "../actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

// One agent's own page (round 9, A4 to A7 and M5): its name, its state, what to do about it. The back arrow sits inside the header row.
// An expired agent shows its own name with an Expired label (icon plus word), one Reconnect button and a small Remove link. Never "Old <name>".
export default async function AgentPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const person = await requireReady();
  const { agent: id } = await searchParams;
  const a = (await agentsFor(person.id).list()).find((x) => x.id === id);
  if (!a || a.status === "revoked") redirect("/agents");
  const type = a.type ?? a.suggestedType ?? null;
  const platform = type ? TYPE_LABEL[type] : "your agent";
  const muse = type === "muse";
  const expired = a.status === "expired";
  const finish = needsFinishSetup(a);

  return (
    <OnbPage header={<BackHeader href="/agents" label={S.nav.agents}>{a.name}</BackHeader>}>
      <div className="row">
        <span className="caption">{platform}</span>
        {muse ? <Tag strong>{S.agents.experimental}</Tag> : null}
      </div>
      {expired ? (
        <>
          <div className="status-line" role="status">
            <StatusIcon kind="alert" />
            <b>{S.agents.expired}</b>
          </div>
          <p className="caption">{muse ? MUSE_EXPIRED : TIMED_OUT_BODY}</p>
          <form action={reconnectAgent}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className="btn-primary btn-block">
              {S.agents.reconnect}
            </button>
          </form>
          <form action={removeAgent}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className="btn-quiet btn-sm">
              {S.agents.remove}
            </button>
          </form>
        </>
      ) : a.status === "unassigned" ? (
        <>
          <p className="caption">{S.agents.waitingBody}</p>
          <Link href={`/agents/confirm?agent=${a.id}`} prefetch={false} className="btn btn-primary btn-block">
            {S.agents.confirm(platform)}
          </Link>
        </>
      ) : finish ? (
        <>
          <div className="status-line" role="status">
            <StatusIcon kind="outline" />
            <b>{S.agents.setupNot}</b>
          </div>
          <p className="caption">{finishBody(platform, a.name)}</p>
          <Link href={`/agents/finish?agent=${a.id}`} prefetch={false} className="btn btn-primary btn-block">
            {S.agents.finishSetup}
          </Link>
        </>
      ) : (
        <>
          {a.setup.kind === "working" ? (
            <>
              <div className="status-line" role="status">
                <StatusIcon kind="check" />
                <b>{S.agents.working}</b>
              </div>
              <p className="caption">{S.agents.lastChecked(shortDate(a.setup.at))}</p>
            </>
          ) : (
            <p className="caption">{NO_CALLS_YET}</p>
          )}
          {muse ? <p className="caption">{S.agents.museNote}</p> : null}
          <ChangeSettings a={a} />
        </>
      )}
    </OnbPage>
  );
}
