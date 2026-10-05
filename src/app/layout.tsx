import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { baseUrl } from "../lib/base-address";
import { BROWSER_THEME_COLOR } from "./brand-colors";
import "./tokens/fonts.css";
import "./tokens/colors.css";
import "./tokens/typography.css";
import "./tokens/spacing.css";
import "./tokens/source-aliases.css";
import "./tokens/app-literals.css";
import "./tokens/base.css";
import "./globals.css";

// Fonts (Dela Gothic One and Figtree) are our own files in src/app/fonts, loaded by tokens/fonts.css. No page asks a font service for anything.

export const metadata: Metadata = {
  title: "Rare Tomato",
  applicationName: "Rare Tomato",
  appleWebApp: { capable: true, title: "Rare Tomato", statusBarStyle: "default" },
  metadataBase: new URL(baseUrl()),
  // favicon.ico, opengraph-image.png and twitter-image.png are picked up from this folder by Next's file conventions. The PNGs are made by scripts/make-brand-icons.mjs.
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  openGraph: { siteName: "Rare Tomato", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: BROWSER_THEME_COLOR, width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          <Link href="/privacy" prefetch={false}>
            Privacy
          </Link>{" "}
          &middot;{" "}
          <Link href="/terms" prefetch={false}>
            Terms
          </Link>
        </footer>
      </body>
    </html>
  );
}
