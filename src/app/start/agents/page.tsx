import { currentSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Narrow } from "../parts";
import { PickAgents } from "./PickAgents";
import { Head, Progress } from "../parts";
import { S } from "@/lib/strings";

export const dynamic = "force-dynamic";

// Which agents do you use? (SPEC A3). At least one is required and there is no skip.
export default async function Pick() {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/start/account");
  if (session.status === "needs_attestation") redirect("/welcome");
  return (
    <Narrow>
      <Progress n={2} />
      <Head title={S.onb.pick.title} body={S.onb.pick.body} />
      <PickAgents />
    </Narrow>
  );
}
