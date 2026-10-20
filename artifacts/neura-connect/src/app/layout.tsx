import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";
import ClientRoot from "./client-root";
import "../index.css";

// Typography: Bricolage Grotesque (display) + DM Sans (body) + JetBrains Mono (data)
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "VastMind — All your socials. One mind.",
  applicationName: "VastMind",
  description: "All your socials in one mind: chat, connect, manage a business, and grow with your communities on VastMind.",
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "VastMind", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: `${base}/favicon.ico`, sizes: "any" },
      { url: `${base}/favicon.svg`, type: "image/svg+xml" },
      { url: `${base}/favicon-32.png`, type: "image/png", sizes: "32x32" },
      { url: `${base}/icon-192.png`, type: "image/png", sizes: "192x192" },
    ],
    apple: { url: `${base}/apple-touch-icon.png`, sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#030611",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="grain min-h-[100dvh]">
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
