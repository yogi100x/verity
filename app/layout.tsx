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
        <SwRegistration />
        <SafetyBanner />
        <div className="flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
