import { careSheetFor } from "@/db/production";
import { CATEGORIES, type Category } from "@/lib/profile";
import { requireReady } from "@/lib/session";
import { CARE_SHEET_LIMITED_NOTE, CARE_SHEET_NAME, CARE_SHEET_NAME_LOWER } from "@/lib/strings";
import { button, card, field, muted, Nav, page } from "../ui";
import { CopyButton } from "./CopyButton";

export const dynamic = "force-dynamic";

const TITLE: Record<Category, string> = { preferences: "Preferences", contacts: "Contacts", family: "Family details" };

export default async function CareSheet({ searchParams }: { searchParams: Promise<{ c?: string | string[]; sensitive?: string; go?: string }> }) {
  const person = await requireReady();
  const q = await searchParams;
  const asked = Array.isArray(q.c) ? q.c : q.c ? [q.c] : q.go ? [] : ["preferences"];
  const picked = asked.filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  const sheet = await careSheetFor(person.id, { categories: picked, includeSensitive: q.sensitive === "1" });

  return (
    <main style={page}>
      <Nav />
      <h1>{CARE_SHEET_NAME}</h1>
      <p>
        For an agent that cannot connect to Rare Tomato, copy this and paste it into the agent&apos;s own memory or instructions. It lists your approved rules and
        the details you choose below. Nothing else is included.
      </p>
      <p style={muted}>
        It is a snapshot, so it goes out of date when you change a rule or a detail. Pasting it asks the agent to read it; nothing makes an agent follow it.
      </p>

      <p style={muted}>{CARE_SHEET_LIMITED_NOTE}</p>

      <form method="get" action="/care-sheet" style={card}>
        <input type="hidden" name="go" value="1" />
        <fieldset>
          <legend>Which details to include</legend>
          {CATEGORIES.map((c) => (
            <div key={c}>
              <label>
                <input type="checkbox" name="c" value={c} defaultChecked={picked.includes(c)} /> {TITLE[c]}
              </label>
            </div>
          ))}
          <div>
            <label>
              <input type="checkbox" name="sensitive" value="1" defaultChecked={q.sensitive === "1"} /> Include details labeled Sensitive
            </label>
          </div>
        </fieldset>
        <p>
          <button type="submit" style={button}>
            Update the sheet
          </button>
        </p>
      </form>

      <label>
        Your {CARE_SHEET_NAME_LOWER}
        <textarea readOnly value={sheet} rows={18} className="copy-box-sm" style={field} />
      </label>
      <CopyButton text={sheet} />
    </main>
  );
}
