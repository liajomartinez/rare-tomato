import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MuseLimit, MuseTimedOut } from "@/app/agents/Muse";
import {
  MUSE_EXPERIMENTAL_LINE, MUSE_LIMIT, MUSE_OBSERVED, MUSE_RECONNECT_STEPS, MUSE_STALE_LINE, MUSE_TIMED_OUT_BUTTON, MUSE_TIMED_OUT_HEADING, MUSE_TIMED_OUT_NOTE, museQuietNote,
} from "./strings";

// Run 8: Muse wording. It says what we saw, as counts, and never "fixed", "reliable", "verified" or "guaranteed".
const read = (p: string) => fs.readFileSync(p, "utf8");
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const BANNED = /\b(fixed|fix|reliable|reliably|verified|guaranteed|guarantee)\b/i;
const escaped = (s: string) => s.replace(/"/g, "&quot;");

describe("Muse wording", () => {
  const all = [MUSE_STALE_LINE, MUSE_OBSERVED, MUSE_LIMIT, MUSE_TIMED_OUT_NOTE, MUSE_TIMED_OUT_BUTTON, museQuietNote(3), ...MUSE_RECONNECT_STEPS];

  it("the limitation line is exactly the agreed words", () => {
    expect(MUSE_STALE_LINE).toBe("Muse may stop connecting after an hour or two. If it does, reconnect it here.");
    expect(html(createElement(MuseLimit, { quietHours: null }))).toContain(MUSE_EXPERIMENTAL_LINE);
  });

  it("never says fixed, reliable, verified or guaranteed about Muse (strings, the card, the guide)", () => {
    for (const t of all) expect(t).not.toMatch(BANNED);
    expect(html(createElement(MuseLimit, { quietHours: 3 }))).not.toMatch(BANNED);
    expect(read("docs/guides/muse.md").replace(/Not a fix:/g, "")).not.toMatch(/\b(reliable|reliably|guaranteed|verified)\b/i);
  });

  it("reports what we saw as counts (74, 93 and 107 minutes) and says it is not a promise", () => {
    expect(MUSE_OBSERVED).toMatch(/three times/);
    expect(MUSE_OBSERVED).toMatch(/74, 93 and 107 minutes/);
    expect(MUSE_OBSERVED).toMatch(/not a promise/);
    expect(MUSE_LIMIT).toMatch(/hour or two/);
  });
});

describe("the Muse card on Your agents", () => {
  it("shows the limitation line, what we observed and the five reconnect steps", () => {
    const h = html(createElement(MuseLimit, { quietHours: null }));
    expect(h).toContain(MUSE_EXPERIMENTAL_LINE);
    expect(h).not.toMatch(/every chat|in the chat itself/i);
    expect(h).toContain("74, 93 and 107 minutes");
    expect(h).toContain("Reconnect Muse");
    for (const step of MUSE_RECONNECT_STEPS) expect(h).toContain(escaped(step));
    expect(MUSE_RECONNECT_STEPS).toHaveLength(5);
    expect(h).toContain("Settings, then Connectors, then Rare Tomato, then Disconnect");
    expect(h).not.toContain("We have not heard from Muse");
  });

  it("when Muse has been quiet for hours it says so without claiming it went stale, and opens the steps", () => {
    const h = html(createElement(MuseLimit, { quietHours: 3 }));
    expect(h).toContain("We have not heard from Muse for about 3 hours");
    expect(h).toContain("simply mean it was not asked");
    expect(h).toMatch(/<details open/);
  });

  it("is shown for a connected Muse, and the timed-out Muse state is used for an unconfirmed expired Muse", () => {
    const page = read("src/app/agents/page.tsx");
    expect(page).toContain('a.type === "muse" ? <MuseLimit');
    expect(page).toContain('a.suggestedType === "muse" ? (');
    expect(page).toContain("<MuseTimedOut");
  });
});

describe("the Timed out state for Muse", () => {
  const h = html(createElement(MuseTimedOut, { id: "abc", removeAction: () => {} }));

  it("has a heading, the reconnect steps, and exactly one primary button", () => {
    expect(h).toContain(MUSE_TIMED_OUT_HEADING);
    expect(h).toContain(MUSE_TIMED_OUT_NOTE);
    expect(h).toContain(MUSE_TIMED_OUT_BUTTON);
    expect(h.match(/<button/g)).toHaveLength(1);
    expect(h).toMatch(/<details open/);
    for (const step of MUSE_RECONNECT_STEPS) expect(h).toContain(escaped(step));
  });

  it("the button removes the timed-out connection (a form that posts its id)", () => {
    expect(h).toContain('name="id" value="abc"');
  });
});

describe("the Muse guide", () => {
  const guide = read("docs/guides/muse.md");
  it("records the three failures, the stale-token limit, the reconnect steps and the status of the bearer spike", () => {
    expect(guide).toMatch(/74, 93 and 107 minutes/);
    expect(guide).toContain("Muse may stop connecting after an hour or two. If it does, reconnect it");
    expect(guide).toContain("Settings");
    expect(guide).toContain("Disconnect");
    expect(guide).toMatch(/not merged and not deployed/);
    expect(guide).toMatch(/owner's decision/);
  });
});
