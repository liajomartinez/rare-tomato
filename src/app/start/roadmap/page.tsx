import Link from "next/link";
import { redirect } from "next/navigation";
import { ROADMAP } from "@/lib/onboarding-copy";
import { currentSession } from "@/lib/session";
import { Actions, Later, LogoHeader, OnbPage, RailVertical, Title } from "../onb";

export const dynamic = "force-dynamic";

// Here's what we'll do (round 9, R): shown first, before any agent is picked. Step 1 is Now, the other two are Next.
export default async function Roadmap() {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/start/account");
  if (session.status === "needs_attestation") redirect("/welcome");
  return (
    <OnbPage
      header={<LogoHeader />}
      actions={
        <Actions
          main={
            <Link href="/start/agents" prefetch={false} className="btn btn-primary btn-block">
              {ROADMAP.start}
            </Link>
          }
          links={<Later />}
        />
      }
    >
      <Title>{ROADMAP.title}</Title>
      <RailVertical agent="claude" at={1} />
      <p className="caption">{ROADMAP.line}</p>
    </OnbPage>
  );
}
