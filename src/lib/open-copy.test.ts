import { describe, expect, it } from "vitest";
import { currentLine, initialState, mainKind, reduce, type OpenCopyEvent } from "./open-copy";

const run = (events: OpenCopyEvent[], hasStage4: boolean) => events.reduce((s, e) => reduce(s, e, { hasStage4 }), initialState);

describe("open, then copy, then paste", () => {
  it("starts at stage 1 with the Open link as the main button and line 1 bold", () => {
    expect(initialState.stage).toBe(1);
    expect(mainKind(1)).toBe("open");
    expect(currentLine(1)).toBe(1);
  });

  it("coming back to the page moves stage 1 to stage 2: Copy is the main button", () => {
    const s = run([{ type: "left" }, { type: "back" }], false);
    expect(s.stage).toBe(2);
    expect(mainKind(2)).toBe("copy");
    expect(currentLine(2)).toBe(2);
  });

  it("a page that never left does not move on when it gets focus again", () => {
    expect(run([{ type: "back" }], false).stage).toBe(1);
  });

  it("copying moves to stage 3, and the main button is Go back to paste, with the same link as stage 1", () => {
    const s = run([{ type: "left" }, { type: "back" }, { type: "copied" }], false);
    expect(s.stage).toBe(3);
    expect(mainKind(3)).toBe("goBack");
    expect(currentLine(3)).toBe(3);
  });

  it("copying before opening still works (quiet Copy at stage 1) and never skips straight past stage 3", () => {
    expect(run([{ type: "copied" }], true).stage).toBe(3);
  });

  it("screens without stage 4 stay at stage 3 however often the person leaves and returns", () => {
    const s = run([{ type: "copied" }, { type: "left" }, { type: "back" }, { type: "left" }, { type: "back" }], false);
    expect(s.stage).toBe(3);
  });

  it("instruction screens reach stage 4 on the next return: I've saved it, and no line is bold", () => {
    const s = run([{ type: "copied" }, { type: "left" }, { type: "back" }], true);
    expect(s.stage).toBe(4);
    expect(mainKind(4)).toBe("saved");
    expect(currentLine(4)).toBe(0);
  });

  it("copying again at stage 4 does not go back", () => {
    expect(run([{ type: "copied" }, { type: "left" }, { type: "back" }, { type: "copied" }], true).stage).toBe(4);
  });
});
