import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { requireReady } from "@/lib/session";

export const dynamic = "force-dynamic";

// "Finish setup" on Connected Agents used to be its own screen. It now opens the same setup flow as first login, on the first step not done yet
// (the old address keeps working and redirects there).
export default async function Finish({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const person = await requireReady();
  const { agent: id } = await searchParams;
  const a = (await agentsFor(person.id).list()).find((x) => x.id === id);
  if (!a || !a.type || a.type === "other") redirect("/agents");
  redirect(`/start/setup?agent=${a.type}`);
}
