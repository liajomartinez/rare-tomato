import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SAVED_AS_RULE_AND_LOCKED_BANNER, SAVED_AS_RULE_BANNER } from "./strings";

// Run 6 screen behaviour. The pages need a signed-in person, so these read the source of the screens (as tap-path.test.ts does) and check the wording.
const read = (p: string) => fs.readFileSync(p, "utf8");

describe("after Save as a rule", () => {
  it("keeps the person on Your rules with the banner and the new rule's address", () => {
    expect(SAVED_AS_RULE_BANNER).toBe("Saved as a rule. Agents that ask will see it.");
    expect(SAVED_AS_RULE_AND_LOCKED_BANNER).toBe("Saved as a rule and locked. Agents that ask will see it.");
    const src = read("src/app/rules/actions.ts");
    expect(src).toContain("/rules?message=");
    expect(src).toContain("&saved=");
    expect(src).toContain("#rule-");
    expect(src).toContain("done(lock ? SAVED_AS_RULE_AND_LOCKED_BANNER : SAVED_AS_RULE_BANNER, id)");
  });

  it("shows the saved rule at the top and marks it in the list, so the card does not just vanish", () => {
    const page = read("src/app/rules/page.tsx");
    expect(page).toContain("The rule you just saved");
    expect(page).toContain("id={`rule-${r.id}`}");
    expect(page).toContain("r.id === q.saved");
  });

  it("each proposed rule links to the task and feedback it came from, as a full-size tap target", () => {
    const page = read("src/app/rules/page.tsx");
    expect(page).toContain("SEE_TASK_LINK");
    expect(page).toMatch(/minHeight: 44[^}]*task-|task-\$\{words\.taskId\}[^]*minHeight: 44/);
  });
});
