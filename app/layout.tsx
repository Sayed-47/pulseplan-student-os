import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PulsePlan — Your Student OS, now proactive",
  description: "Turn Notion Student OS deadlines into a realistic, risk-aware weekly study plan.",
  applicationName: "PulsePlan",
};

export const viewport: Viewport = {
  themeColor: "#f4f4ef",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
