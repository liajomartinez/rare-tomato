// When and how the "add to home screen" card shows (SPEC FR-K2). Pure, so every platform rule is tested without a phone.
//   - Never on a first visit: only after the first agent is connected or the first rule is approved.
//   - Android / Chrome: our own button that triggers the browser's install prompt.
//   - iPhone Safari: a short instruction card, since iPhone allows no programmatic prompt.
//   - Dismissible, and the dismissal is remembered. Hidden once installed. Also reachable from Settings and data (always shown there).

export type Platform = "ios" | "android" | "other";

export interface InstallInputs {
  /** Server side: the person has connected an agent or approved a rule. */
  eligible: boolean;
  dismissed: boolean;
  installed: boolean;
  platform: Platform;
  /** The browser has offered an install prompt we can trigger (Chrome on Android and desktop). */
  canPrompt: boolean;
  /** True on the Settings and data screen, where the card is always reachable (still hidden once installed). */
  alwaysAvailable?: boolean;
}

export type InstallCardState = "hidden" | "button" | "ios_steps" | "unsupported";

export function installCardState(i: InstallInputs): InstallCardState {
  if (i.installed) return "hidden";
  if (!i.alwaysAvailable && (!i.eligible || i.dismissed)) return "hidden";
  if (i.platform === "ios") return "ios_steps";
  if (i.canPrompt) return "button";
  return i.alwaysAvailable ? "unsupported" : "hidden";
}

export function platformFromUserAgent(ua: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export const DISMISS_KEY = "rt-install-card-dismissed";
