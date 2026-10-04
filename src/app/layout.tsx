import type { Metadata, Viewport } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rare Tomato",
  applicationName: "Rare Tomato",
  appleWebApp: { capable: true, title: "Rare Tomato", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#c1121f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif", fontSize: "0.9rem" }}>
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
