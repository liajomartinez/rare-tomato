import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import "./tokens.css";
import "./globals.css";

// Headings and the wordmark: Bricolage Grotesque 600 and 800. Everything else: IBM Plex Sans 400, 500 and 600. next/font downloads them at build
// time and serves them from our own address, so no page asks Google for anything.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "800"], variable: "--font-bricolage", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: "Rare Tomato",
  applicationName: "Rare Tomato",
  appleWebApp: { capable: true, title: "Rare Tomato", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#c1121f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${plex.variable}`}>
      <body>
        {children}
        <footer style={{ maxWidth: 640, margin: "2rem auto", padding: "0 var(--gutter) 2rem", fontSize: "var(--size-small)" }}>
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
