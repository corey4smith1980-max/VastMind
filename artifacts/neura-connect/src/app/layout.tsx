import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono, Outfit } from "next/font/google";
import ClientRoot from "./client-root";
import "../index.css";

// Typography: Bricolage Grotesque (display) + DM Sans (body) + JetBrains Mono (data)
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const brand = Outfit({ subsets: ["latin"], variable: "--font-brand", weight: ["600", "700", "800"], display: "swap" });

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DEFAULT_APP_ORIGIN = "https://vastmind-gateway-production.up.railway.app";

function appOrigin(): string {
  const configured = process.env.PUBLIC_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || DEFAULT_APP_ORIGIN;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_APP_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

const canonicalPath = base ? `${base}/` : "/";

export const metadata: Metadata = {
  metadataBase: new URL(appOrigin()),
  title: "VastMind — All your socials. One mind.",
  applicationName: "VastMind",
  description: "All your socials in one mind: chat, share posts, manage a business, and grow on VastMind.",
  alternates: { canonical: canonicalPath },
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "VastMind", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "VastMind",
    description: "ALL YOUR SOCIALS • ONE MIND",
    siteName: "VastMind",
    url: canonicalPath,
    images: [{ url: `${base}/og.png`, width: 1200, height: 630, alt: "VastMind. All your socials. One mind." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VastMind",
    description: "ALL YOUR SOCIALS • ONE MIND",
    images: [`${base}/og.png`],
  },
  icons: {
    icon: [
      { url: `${base}/favicon.ico`, sizes: "any" },
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
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable} ${brand.variable}`}>
      <body className="grain min-h-[100dvh]">
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
