import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";
import { AccountForm } from "./AccountForm";
import { Head, Narrow, Progress } from "../parts";
import { S } from "@/lib/strings";

export const dynamic = "force-dynamic";

// Create your account (SPEC A2). Sign-in itself is the hosted sign-in page (we do not take an email or a password here, and we have no third way in).
// The 18-or-older tick is repeated on the "One quick thing" page after sign-in, which is where it is recorded on the account.
export default async function CreateAccount() {
  const session = await currentSession();
  if (session.status === "ready") redirect("/");
  return (
    <Narrow>
      <Progress n={1} />
      <Head title={S.onb.signup.title} body={S.onb.signup.body} />
      <AccountForm />
    </Narrow>
  );
}
