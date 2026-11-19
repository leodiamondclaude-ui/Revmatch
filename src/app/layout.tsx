import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Saira } from "next/font/google";
import "./globals.css";

const saira = Saira({ subsets: ["latin"], variable: "--font-saira", weight: ["500", "700", "800", "900"], style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "RevMatch: show off the whole build", template: "%s · RevMatch" },
  description: "Four photos and RevMatch drafts your spec sheet. Add your mods, log drives on your phone, and share your build with a QR code.",
};
export const viewport: Viewport = { themeColor: "#07080a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${saira.variable} ${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
