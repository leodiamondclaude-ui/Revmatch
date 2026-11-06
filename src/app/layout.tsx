import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Saira } from "next/font/google";
import "./globals.css";

const saira = Saira({ subsets: ["latin"], variable: "--font-saira", weight: ["500", "700", "800", "900"], style: ["normal", "italic"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: "RevMatch — Digital Garage & Drive Telemetry", template: "%s · RevMatch" },
  description: "Showcase your build in 3D, log every modification, and record real drive telemetry from your phone.",
};
export const viewport: Viewport = { themeColor: "#07080a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${saira.variable} ${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
