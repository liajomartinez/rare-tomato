import type { MetadataRoute } from "next";
import { BROWSER_THEME_COLOR, INSTALLED_BACKGROUND_COLOR } from "./brand-colors";

// The web app manifest (SPEC FR-K1): a home-screen icon and a full-screen window. No offline mode and no push notifications (P2).
// The icons are the real tomato mark, made by scripts/make-brand-icons.mjs. The maskable icon keeps its mark inside the centre safe area. Sign-in inside the installed app has not been checked on a real phone yet (FR-K3, on Lia's list).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Rare Tomato",
    short_name: "Rare Tomato",
    description: "Correct an agent once, approve the rule, and every agent you use can get it from one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: INSTALLED_BACKGROUND_COLOR,
    theme_color: BROWSER_THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
