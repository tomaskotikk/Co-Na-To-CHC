import type { Metadata, Viewport } from "next";
import { League_Spartan, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const display = League_Spartan({ subsets: ["latin", "latin-ext"], weight: ["600", "800", "900"], variable: "--font-display" });
const body = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Co na to CHC?",
  description: "Stužkovací show Creative Hill College",
  icons: { icon: "/logo-chc.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
