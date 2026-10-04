"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DISMISS_KEY, installCardState, platformFromUserAgent, type InstallCardState } from "@/lib/install-card";
import { button, card, muted } from "./ui";

// The "add to home screen" card (SPEC FR-K2). The rules for when it shows live in src/lib/install-card.ts. A home-screen icon and a
// full-screen window only: no offline mode and no push notifications.

export function InstallCardView({ state, onInstall, onDismiss }: { state: InstallCardState; onInstall?: () => void; onDismiss?: () => void }) {
  if (state === "hidden") return null;
  return (
    <section style={card} aria-label="Add to your home screen">
      <h2>Add Rare Tomato to your home screen</h2>
      {state === "button" ? (
        <>
          <p>Open it like an app, in its own full-screen window.</p>
          <p>
            <button type="button" style={button} onClick={onInstall}>
              Add to home screen
            </button>
          </p>
        </>
      ) : null}
      {state === "ios_steps" ? <p>On iPhone: tap the Share button in Safari, then tap Add to Home Screen.</p> : null}
      {state === "unsupported" ? (
        <p style={muted}>
          This browser does not offer a one-tap install. On iPhone, use Safari: tap Share, then Add to Home Screen. On Android, use Chrome&apos;s menu and choose Add to Home screen.
        </p>
      ) : null}
      {onDismiss ? (
        <p>
          <button type="button" style={button} onClick={onDismiss}>
            Not now
          </button>
        </p>
      ) : null}
    </section>
  );
}

type BeforeInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const subscribe = () => () => undefined;
const serverSnapshot = () => "";
/** What this browser tells us, as one stable string (so React can compare it). Empty on the server and on first paint. */
function envSnapshot(): string {
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // storage can be blocked; the card then simply shows again next time
  }
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return JSON.stringify({ platform: platformFromUserAgent(navigator.userAgent, navigator.maxTouchPoints), installed: Boolean(standalone), dismissed });
}

export function InstallCard({ eligible, alwaysAvailable = false }: { eligible: boolean; alwaysAvailable?: boolean }) {
  const raw = useSyncExternalStore(subscribe, envSnapshot, serverSnapshot);
  const [prompt, setPrompt] = useState<BeforeInstallPrompt | null>(null);
  const [changed, setChanged] = useState<{ dismissed?: boolean; installed?: boolean }>({});

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPrompt);
    };
    const onInstalled = () => setChanged((c) => ({ ...c, installed: true }));
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!raw) return null; // nothing on the server and on first paint: the card depends on the phone
  const env = JSON.parse(raw) as { platform: "ios" | "android" | "other"; installed: boolean; dismissed: boolean };
  const state = installCardState({
    eligible,
    dismissed: changed.dismissed ?? env.dismissed,
    installed: changed.installed ?? env.installed,
    platform: env.platform,
    canPrompt: prompt !== null,
    alwaysAvailable,
  });
  return (
    <InstallCardView
      state={state}
      onInstall={async () => {
        if (!prompt) return;
        await prompt.prompt();
        setPrompt(null);
      }}
      onDismiss={
        alwaysAvailable
          ? undefined
          : () => {
              try {
                window.localStorage.setItem(DISMISS_KEY, "1");
              } catch {
                // see above
              }
              setChanged((c) => ({ ...c, dismissed: true }));
            }
      }
    />
  );
}
