import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentView } from "@/lib/agents-view";
import { Health } from "./Health";

const agent: AgentView = {
  id: "a1", name: "Marge", type: "muse", suggestedType: null, scopes: [], status: "active",
  lastSeenAt: new Date("2026-10-01T10:00:00Z"), expiresAt: null, usesBearer: false,
  lastRulesFetchedAt: new Date("2026-10-01T09:30:00Z"), lastTaskAt: new Date("2026-10-01T09:45:00Z"), notSeenRecently: false, setup: { kind: "not_finished" }, calls: { rules: null, details: null, task: null },
};
const render = (over: Partial<AgentView> = {}) => renderToStaticMarkup(createElement(Health, { agent: { ...agent, ...over } }));

describe("connection health wording (FR-A5)", () => {
  it("says only that a request for the rules arrived, from our server", () => {
    const html = render();
    expect(html).toContain("Last asked for your rules: 2026-10-01 09:30 UTC");
    expect(html).toContain("Our server records this when a request for your rules arrives");
  });

  it("never says or implies the agent followed, used, or complied with the rules", () => {
    for (const html of [render(), render({ lastRulesFetchedAt: null, lastTaskAt: null }), render({ notSeenRecently: true })]) {
      expect(html).not.toMatch(/follow|obey|compl(y|ied|iance)|appl(y|ied)|honou?r|respect|enforc|verified|guarantee|used your rules|checked your rules/i);
    }
  });

  it("labels task times as agent-reported and says plainly when there is nothing yet", () => {
    expect(render()).toContain("(agent-reported)");
    const none = render({ lastRulesFetchedAt: null, lastTaskAt: null });
    expect(none).toContain("Last asked for your rules: not yet");
    expect(none).not.toContain("(agent-reported)");
  });

  it("shows the 7-day nudge only when it applies", () => {
    expect(render({ notSeenRecently: true })).toContain("more than 7 days");
    expect(render()).not.toContain("more than 7 days");
  });
});
