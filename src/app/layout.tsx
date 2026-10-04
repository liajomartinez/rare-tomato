import type { Metadata, Viewport } from "next";
import Link from "next/link";
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
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
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
