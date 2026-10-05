import Link from "next/link";
import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { needsFinishSetup } from "@/lib/onboarding";
import { GUIDED, isGuided, messageLinkKey, TYPE_LABEL } from "@/lib/platforms";
import { requireReady } from "@/lib/session";
import { CHATGPT_WEBSITE_NOTE, finishBody, GROK_DESKTOP_NOTE, messageBody, MUSE_DESKTOP_NOTE, S } from "@/lib/strings";
import { CopyButton } from "../../care-sheet/CopyButton";
import { Narrow } from "../../start/parts";
import { Banner, Tag } from "../../ui";
import { InstructionBlock, OpenButton, ShowWhere } from "../SetupParts";

export const dynamic = "force-dynamic";

// Finish setup (SPEC 4b, 4d, 4g): a focused screen for one connected agent that has not checked Rare Tomato yet. Claude and ChatGPT: the instruction.
// Grok Bot and Muse: a prompt to paste into a chat. Muse also carries the reliability notice. The card on Your agents turns to "Working" only when a
// real request from the agent reaches our server.
export default async function Finish({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const person = await requireReady();
  const { agent: id } = await searchParams;
  const a = (await agentsFor(person.id).list()).find((x) => x.id === id);
  if (!a || !a.type || !needsFinishSetup(a)) redirect("/agents");
  const platform = TYPE_LABEL[a.type];
  const back = (
    <div>
      <Link href="/agents" prefetch={false} className="btn btn-quiet pull-left">
        {"←"} {S.nav.agents}
      </Link>
    </div>
  );

  if (isGuided(a.type)) {
    const G = GUIDED[a.type];
    return (
      <Narrow>
        {back}
        <div className="stack stack-3">
          <h1>{S.agents.finishTitle(a.name)}</h1>
          <p className="lead">{finishBody(platform, a.name)}</p>
        </div>
        <InstructionBlock />
        {a.type === "chatgpt" ? <p className="caption">{CHATGPT_WEBSITE_NOTE}</p> : null}
        <OpenButton linkKey={G.instrLink}>{G.instr.open}</OpenButton>
        <ShowWhere steps={G.instr.where} />
      </Narrow>
    );
  }

  const linkKey = messageLinkKey(a.type);
  return (
    <Narrow>
      {back}
      <div className="stack stack-3">
        {a.type === "muse" ? (
          <div>
            <Tag strong>{S.agents.experimental}</Tag>
          </div>
        ) : null}
        <h1>{S.agents.finishTitle(a.name)}</h1>
        <p className="lead">{messageBody(a.name)}</p>
      </div>
      <div className="stack stack-3">
        <p className="strong-line">{a.type === "muse" ? S.agents.museStep : `Paste this into a ${platform} chat.`}</p>
        <div className="copy-box">{S.agents.prompt}</div>
        <CopyButton text={S.agents.prompt} label={S.agents.copyPrompt} copiedLabel={S.onb.setup.copied} primary block />
      </div>
      {linkKey ? <OpenButton linkKey={linkKey}>{S.onb.setup.openAgent(platform)}</OpenButton> : null}
      {a.type === "muse" ? <Banner tone="headsup">{S.agents.museNote}</Banner> : null}
      <p className="caption">{a.type === "muse" ? MUSE_DESKTOP_NOTE : GROK_DESKTOP_NOTE}</p>
    </Narrow>
  );
}
