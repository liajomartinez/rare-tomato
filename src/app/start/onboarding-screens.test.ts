import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AGENT_LINKS, linkUrl, OUTBOUND, type LinkId } from "@/lib/agent-links";
import { COPY } from "@/lib/onboarding-copy";
import type { Stage } from "@/lib/open-copy";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));
vi.mock("./actions", () => ({ doThisLater: async () => undefined, saveFirstRule: async () => undefined, savePicks: async () => undefined }));

const { OpenCopyScreen, ItemsScreen } = await import("./OpenCopy");
const { CheckScreen } = await import("./CheckScreen");
const { OutLink, StepHeader } = await import("./onb");

const render = (el: ReactElement) => renderToStaticMarkup(el);
const header = createElement(StepHeader, { agent: "claude", at: 2 });
const noTop = createElement("h1", null, "Title");

/** The text of the main (primary) button, and its address if it is a link. There must be exactly one. */
function main(html: string) {
  const all = [...html.matchAll(/<(a|button)\b([^>]*class="[^"]*btn-primary[^"]*"[^>]*)>(.*?)<\/\1>/g)];
  expect(all, "exactly one main button").toHaveLength(1);
  const [, tag, attrs, inner] = all[0];
  return { tag, text: inner.replace(/<[^>]+>/g, ""), href: /href="([^"]*)"/.exec(attrs)?.[1], attrs };
}
/** The numbered lines that are shown: their numbers, and whether each is bold. Round 12 shows only the current line. */
const shownLines = (html: string) => {
  const lis = html.split('<ol class="onb-lines">')[1]?.split("</ol>")[0] ?? "";
  return [...lis.matchAll(/<li([^>]*)><span class="badge"[^>]*>(\d)<\/span>/g)].map((m) => ({ n: Number(m[2]), bold: /class="on"/.test(m[1]) }));
};
const INSTRUCTION_START = "check my Rare Tomato rules (get_rules) and saved details (get_care_profile) first";

const instr = COPY.claude.instr!;
const instrScreen = (stage: Stage) =>
  render(
    createElement(OpenCopyScreen, {
      header,
      top: noTop,
      lines: instr.lines,
      text: instr.text,
      linkId: "L2",
      openLabel: instr.open,
      goBackLabel: instr.goBack,
      copyLabel: instr.copy,
      savedLabel: instr.saved,
      savedHref: "/start/setup?agent=claude&step=check",
      initialStage: stage,
    }),
  );

describe("the instruction screen (Claude C5): each stage has the right main button", () => {
  it("state 1: Open Claude instructions, a link to the confirmed address; only line 1 shows, in bold; the instruction is hidden; Copy is quiet", () => {
    const html = instrScreen(1);
    const m = main(html);
    expect(m.tag).toBe("a");
    expect(m.text).toBe("Open Claude instructions");
    expect(m.href).toBe("https://claude.ai/settings/profile");
    expect(shownLines(html)).toEqual([{ n: 1, bold: true }]);
    expect(html).not.toContain(INSTRUCTION_START);
    expect(html).toMatch(/class="btn-quiet"[^>]*>Copy instruction</);
  });

  it("state 2: Copy instruction is the main button; only line 2 shows; the instruction shows in a bordered box; Open is now a link", () => {
    const html = instrScreen(2);
    const m = main(html);
    expect(m.tag).toBe("button");
    expect(m.text).toBe("Copy instruction");
    expect(shownLines(html)).toEqual([{ n: 2, bold: true }]);
    expect(html).toContain(INSTRUCTION_START);
    expect(html).toContain('class="onb-msg"');
    expect(html).toContain(">Open Claude instructions</a>");
  });

  it("state 3: tick and Copied, and Go back to Claude to paste is the main button with the same link as state 1; only line 3 shows", () => {
    const html = instrScreen(3);
    const m = main(html);
    expect(m.text).toBe("Go back to Claude to paste");
    expect(m.href).toBe(main(instrScreen(1)).href);
    expect(html).toContain("Copied");
    expect(shownLines(html)).toEqual([{ n: 3, bold: true }]);
    expect(html).not.toContain(INSTRUCTION_START);
  });

  it("state 4: I've saved it is the main button, and the last line is the one shown", () => {
    const html = instrScreen(4);
    const m = main(html);
    expect(m.text).toBe("I&#x27;ve saved it");
    expect(m.href).toBe("/start/setup?agent=claude&amp;step=check");
    expect(shownLines(html)).toEqual([{ n: 3, bold: true }]);
  });

  it("every state shows exactly one numbered line, and the instruction word for word wherever it is shown", () => {
    for (const s of [1, 2, 3, 4] as const) expect(shownLines(instrScreen(s))).toHaveLength(1);
    expect(instrScreen(2)).toContain(instr.text);
  });

  it("Do this later is a small link, never a second button of the main kind", () => {
    for (const s of [1, 2, 3, 4] as const) {
      const html = instrScreen(s);
      expect(html).toContain("Do this later");
      expect((html.match(/btn-primary/g) ?? []).length).toBe(1);
    }
  });

  it("outbound links open in a new tab and cannot reach back to this page", () => {
    const html = instrScreen(1);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(OUTBOUND).toEqual({ target: "_blank", rel: "noopener noreferrer" });
  });
});

describe("the check screens (C6, G6, K4, M6): three states, then the answers", () => {
  const check = (key: "claude" | "chatgpt" | "grok" | "muse", over: Record<string, unknown> = {}, initial: { firstGetRules: string | null; firstLogTask: string | null; status: "active" } = { firstGetRules: null, firstLogTask: null, status: "active" }) =>
    render(
      createElement(CheckScreen, {
        agentId: "id",
        initial,
        copy: COPY[key],
        chatLink: ({ claude: "L3", chatgpt: "L6", grok: "L9", muse: "L11" } as const)[key],
        headerWaiting: header,
        headerReady: header,
        nextHref: "/start/setup?agent=claude&step=rule",
        ...over,
      }),
    );

  it.each([
    ["claude", "Start a new chat in Claude", "https://claude.ai/new", "Go back to Claude to paste"],
    ["chatgpt", "Start a new chat in ChatGPT", "https://chatgpt.com", "Go back to ChatGPT to paste"],
    ["grok", "Start a new chat in Grok Bot", "https://grok.com", "Go back to Grok Bot to paste"],
    ["muse", "Start a new chat in Muse", "https://muse.ai/thread/new", "Go back to Muse to paste"],
  ] as const)("%s: state 1 opens the chat, state 2 is Copy message, state 3 goes back to paste (no state 4)", (key, open, url, back) => {
    const s1 = main(check(key, { initialStage: 1 }));
    expect(s1.text).toBe(open);
    expect(s1.href).toBe(url);
    expect(main(check(key, { initialStage: 2 })).text).toBe("Copy message");
    const s3 = main(check(key, { initialStage: 3 }));
    expect(s3.text).toBe(back);
    expect(s3.href).toBe(url);
  });

  it("ready: Claude is ready, and Continue is the main button", () => {
    const html = check("claude", {}, { firstGetRules: "a", firstLogTask: "b", status: "active" });
    expect(html).toContain("Claude is ready");
    expect(main(html).text).toBe("Continue");
  });

  it("almost there: Copy message is the main button, and the reply message is shown", () => {
    const html = check("claude", {}, { firstGetRules: "a", firstLogTask: null, status: "active" });
    expect(html).toContain("Almost there");
    expect(main(html).text).toBe("Copy message");
    expect(html).toContain("Now report what you did to Rare Tomato.");
  });

  it("almost there for Claude draws no Open Claude button, because that link has no address yet", () => {
    const html = check("claude", {}, { firstGetRules: "a", firstLogTask: null, status: "active" });
    expect(html).not.toContain(">Open Claude</a>");
    const chatgpt = check("chatgpt", {}, { firstGetRules: "a", firstLogTask: null, status: "active" });
    expect(chatgpt).toContain("Start a new chat in ChatGPT</a>");
  });

  it("not seen yet: Check again is the main button", () => {
    const html = check("claude", { initialNotSeen: true, instrLink: "L2", instrLabel: "Open Claude instructions" });
    expect(html).toContain("We haven&#x27;t seen Claude yet");
    expect(main(html).text).toBe("Check again");
  });

  it("Muse keeps its Experimental notice on the check screen", () => {
    const html = check("muse", { notice: createElement("p", null, "Our connection to Muse is experimental."), initialStage: 1 });
    expect(html).toContain("Our connection to Muse is experimental.");
  });
});

describe("the form screen (Claude C2): Open stays the main button and Copy sits beside each item", () => {
  const F = COPY.claude.form!;
  const html = render(createElement(ItemsScreen, { header, top: noTop, lines: F.lines, items: F.items, linkId: "L1", openLabel: F.main, settledHref: "/x" }));
  it("main is Open Claude connectors, with both items copyable", () => {
    expect(main(html).text).toBe("Open Claude connectors");
    expect(main(html).href).toBe("https://claude.ai/settings/connectors?modal=add-custom-connector");
    expect((html.match(/>Copy</g) ?? []).length).toBe(2);
    expect(html).toContain("https://raretomato.ai/mcp");
  });
});

describe("links with no address draw nothing", () => {
  it.each(["L3b", "L8"] as LinkId[])("%s has no url, and OutLink renders an empty string", (id) => {
    expect(linkUrl(id)).toBeNull();
    // eslint-disable-next-line react/no-children-prop
    expect(render(createElement(OutLink, { id, kind: "primary", children: "Open" }))).toBe("");
  });

  it("a screen whose link is missing never shows an anchor without an address", () => {
    const html = render(createElement(OpenCopyScreen, { header, top: noTop, lines: ["a", "b", "c"], text: "t", linkId: "L8", openLabel: "Open", goBackLabel: "Back", copyLabel: "Copy" }));
    expect(html).not.toMatch(/<a[^>]*href=""/);
    expect(html).not.toContain(">Open<");
    expect(main(html).text).toBe("Copy"); // with no link to open, Copy is the main button from the start
  });
});

describe("the link config", () => {
  it("holds L1 to L11 and L3b, each with a url or null and a status", () => {
    expect(Object.keys(AGENT_LINKS).sort()).toEqual(["L1", "L10", "L11", "L2", "L3", "L3b", "L4", "L5", "L6", "L7", "L8", "L9"]);
    for (const l of Object.values(AGENT_LINKS)) {
      expect(["confirmed", "partial", "verify"]).toContain(l.status);
      expect(l.url === null || /^https:\/\//.test(l.url)).toBe(true);
      if (l.url === null) expect(l.status).toBe("verify");
    }
  });

  it("uses only the addresses Lia confirmed or the two vendor home pages, and invents none", () => {
    const urls = new Set(Object.values(AGENT_LINKS).map((l) => l.url).filter(Boolean));
    expect([...urls].sort()).toEqual(
      [
        "https://chatgpt.com",
        "https://chatgpt.com/settings/personalization",
        "https://claude.ai/new",
        "https://claude.ai/settings/connectors?modal=add-custom-connector",
        "https://claude.ai/settings/profile",
        "https://grok.com",
        "https://muse.ai/thread/new",
      ].sort(),
    );
    expect(AGENT_LINKS.L4.status).toBe("partial");
    expect(AGENT_LINKS.L7.status).toBe("partial");
    expect(AGENT_LINKS.L9.status).toBe("partial");
  });
});

describe("the header", () => {
  it("is one row with the rail, the step label, and Done, Now and Next as words for screen readers", () => {
    const html = render(createElement(StepHeader, { agent: "claude", at: 2 }));
    expect(html).toContain("Step 2 of 3 · Tell it to use Rare Tomato");
    expect(html).toContain("Done: Connect your agent");
    expect(html).toContain("Now: Tell it to use Rare Tomato");
    expect(html).toContain("Next: Write your first rule");
    expect(render(createElement(StepHeader, { agent: "claude", at: 3, all: true }))).toContain("Step 3 of 3 · Done");
  });
});
