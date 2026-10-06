import { requireReady } from "@/lib/session";
import { S } from "@/lib/strings";
import { BackHeader, OnbPage } from "../../start/onb";
import { writeRule } from "../actions";

export const dynamic = "force-dynamic";

// Write a rule: one box and one primary button. The back arrow is inside the header row.
export default async function WriteRule({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireReady();
  const { error } = await searchParams;
  return (
    <OnbPage header={<BackHeader href="/rules" label={S.nav.rules}>Write a rule</BackHeader>}>
      <form action={writeRule} className="stack stack-3">
        <label className="visually-hidden" htmlFor="rule-text">
          Type a rule in your own words
        </label>
        <textarea id="rule-text" name="text" rows={4} maxLength={300} required placeholder="Type a rule in your own words" />
        {error ? (
          <p role="alert" className="caption">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary btn-block">
          {S.rules.save}
        </button>
      </form>
    </OnbPage>
  );
}
