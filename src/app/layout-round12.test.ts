import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstallCardView } from "./InstallCard";
import { TaskCard } from "./feed/TaskCard";
import { AgentLabel, Tabs } from "./ui";
import type { TaskView } from "@/lib/tasks";

// Round 12: the flat layout. The rendered-screen checks (at most one card per screen, no "Signed in as" or Privacy and Terms in page bodies) run over every
// real screen in scripts/ux-fixtures.script.ts; the rail's width check is scripts/check-rail-layout.mjs. These tests cover the pieces and the source.

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const pages = walk("src/app").filter((f) => /\/(page|layout)\.tsx$/.test(f));

describe("text tabs", () => {
  const html = renderToStaticMarkup(
    createElement(Tabs, { label: "Which tasks to show", items: [{ label: "To review (0)", href: "/feed?unreviewed=1", active: true }, { label: "All", href: "/feed?unreviewed=0", active: false }] }),
  );
  it("marks only the active tab, which the style makes bold and underlined", () => {
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/aria-current="true"[^>]*>To review \(0\)</);
    expect(read("src/app/globals.css")).toMatch(/\.tabs a\[aria-current="true"\]\{[^}]*font-weight[^}]*text-decoration:underline/);
  });
  it("has no pill or card class", () => {
    expect(html).not.toMatch(/chip|card/);
  });
});

describe("an agent's name is shown once", () => {
  it("does not repeat the kind when it is the same as the name", () => {
    const html = renderToStaticMarkup(createElement(AgentLabel, { name: "Claude", type: "Claude" }));
    expect(html.match(/Claude/g)).toHaveLength(1);
  });
  it("adds the kind in small gray text only when the name is different", () => {
    const html = renderToStaticMarkup(createElement(AgentLabel, { name: "Marge", type: "Claude" }));
    expect(html).toContain("<b>Marge</b>");
    expect(html).toContain('<span class="caption"> Claude</span>');
  });
});

describe("flat pieces", () => {
  it("a task is a plain row with no card", () => {
    const task: TaskView = { id: "t", connectionId: "c", agentName: "Marge", summary: "Booked it", category: "booking", outcome: "completed", rulesConsulted: [], occurredAt: new Date("2026-10-01T15:00:00Z"), hasFeedback: false };
    const html = renderToStaticMarkup(createElement(TaskCard, { task }));
    expect(html).not.toMatch(/class="[^"]*\bcard\b/);
    expect(html).toContain("flat-row");
    expect(html).toContain("<b");
  });

  it("the home-screen prompt is one collapsed row, with Not now inside it", () => {
    const html = renderToStaticMarkup(createElement(InstallCardView, { state: "ios_steps", onDismiss: () => undefined }));
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Add Rare Tomato to your home screen");
    expect(html).toContain("Not now");
    expect(html).not.toMatch(/class="[^"]*\bcard\b/);
  });
});

describe("what never appears in a page body", () => {
  it("'Signed in as' is only on Settings and data", () => {
    const users = pages.filter((f) => read(f).includes("SignedInAs"));
    expect(users).toEqual(["src/app/data/page.tsx"]);
  });

  it("the site footer (Privacy and Terms) is gone from the layout", () => {
    expect(read("src/app/layout.tsx")).not.toMatch(/footer|href="\/privacy"|href="\/terms"/);
  });

  it("Privacy and Terms links are only in Settings and data, the signed-out pages and the two documents themselves", () => {
    const allowed = new Set(["src/app/data/page.tsx", "src/app/start/Landing.tsx", "src/app/start/account/AccountForm.tsx", "src/app/welcome/page.tsx", "src/app/privacy/page.tsx", "src/app/terms/page.tsx"]);
    const withLinks = walk("src/app")
      .filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f))
      .filter((f) => /href="\/(privacy|terms)"/.test(read(f)));
    expect(withLinks.filter((f) => !allowed.has(f))).toEqual([]);
  });

  it("Home has no 'Add your saved details' line and no list of connected agents above the card", () => {
    const home = read("src/app/page.tsx");
    expect(home).not.toContain("Add your saved details");
    expect(home).not.toContain("WhoCanSee");
  });

  it("the explanations are small links at the bottom, not text above the content", () => {
    expect(read("src/app/feed/page.tsx")).toContain("BottomLink");
    expect(read("src/app/feed/page.tsx")).not.toContain("S.feed.pace");
    expect(read("src/app/agents/page.tsx")).toContain("BottomLink");
    expect(read("src/app/rules/page.tsx")).toContain("BottomLink");
  });
});

describe("the setup rail never collapses (a finished step is a link, and its shape must still fill its segment)", () => {
  const css = read("src/app/globals.css");
  it("the three segments are equal and the shape fills each one, inside a link or not", () => {
    expect(css).toMatch(/\.onb-seg\{[^}]*flex:1 1 0/);
    expect(css).not.toMatch(/\.onb-seg\.is-now\{flex/);
    expect(css).toMatch(/\.onb-seg \.shape\{[^}]*width:100%[^}]*height:100%/);
    expect(css).toMatch(/\.onb-seg a\{[^}]*display:block/);
  });
});
