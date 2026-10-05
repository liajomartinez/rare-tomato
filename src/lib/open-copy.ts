// The open, then copy, then paste pattern (round 9, section 4.2), as a small pure reducer so it can be tested without a browser.
//
//   stage 1  Before anything. Main button: the Open link. Copy is a quiet link.
//   stage 2  The person left this page and came back. Main button: Copy. Open becomes a link.
//   stage 3  After copying (tick and "Copied"). Main button: "Go back to <place> to paste" (the same link as stage 1).
//   stage 4  Instruction screens only: the person left again and came back. Main button: "I've saved it".
//
// Connect and check screens have no stage 4: after stage 3 the page waits and updates by itself.
// "Left" means the page was hidden or lost focus; "back" means it was visible or focused again. Copy never opens the destination.

export type Stage = 1 | 2 | 3 | 4;
export interface OpenCopyState {
  stage: Stage;
  /** The page was hidden or blurred since the last change of stage, so the next "back" counts. */
  away: boolean;
}
export type OpenCopyEvent = { type: "left" } | { type: "back" } | { type: "copied" };

export const initialState: OpenCopyState = { stage: 1, away: false };

export function reduce(state: OpenCopyState, event: OpenCopyEvent, opts: { hasStage4: boolean }): OpenCopyState {
  switch (event.type) {
    case "left":
      return state.away ? state : { ...state, away: true };
    case "back": {
      if (!state.away) return state;
      if (state.stage === 1) return { stage: 2, away: false };
      if (state.stage === 3 && opts.hasStage4) return { stage: 4, away: false };
      return { ...state, away: false };
    }
    case "copied":
      // Copying from stage 1 (before opening) or stage 2 both lead to stage 3. A copy again at stage 3 or 4 changes nothing.
      return state.stage <= 2 ? { stage: 3, away: false } : state;
  }
}

/** The one line (1, 2 or 3) shown in bold, or 0 for none. In stage 4 nothing is highlighted. */
export const currentLine = (stage: Stage): 0 | 1 | 2 | 3 => (stage === 4 ? 0 : stage);

/** What the main button is for each stage. */
export type MainKind = "open" | "copy" | "goBack" | "saved";
export const mainKind = (stage: Stage): MainKind => (stage === 1 ? "open" : stage === 2 ? "copy" : stage === 3 ? "goBack" : "saved");
