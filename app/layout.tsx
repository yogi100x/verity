import type { Metadata, Viewport } from "next";
import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { SafetyBanner } from "@/components/ui/SafetyBanner";
import { SwRegistration } from "@/components/shell/SwRegistration";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  weight: "variable",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Verity — your family's paperwork, finally saying one thing",
  description:
    "Verity reads the letters, prescriptions and notes you already have, shows you where they disagree, and writes the document the next person needs — with every line traced back to the page it came from.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#14453D",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-GB"
      className={`${fraunces.variable} ${publicSans.variable} ${plexMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {/* Skip link — first focusable element on every page (NHS service
            manual accessibility guidance). Visually hidden until focused;
            jumps keyboard and screen-reader users past the banner and nav
            straight to the page's main content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-surface focus:px-4 focus:py-2 focus:text-body focus:text-ink focus:outline focus:outline-2 focus:outline-brand"
        >
          Skip to main content
        </a>
        <SwRegistration />
        <SafetyBanner />
        <div className="flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
