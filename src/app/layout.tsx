import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forecode — Architecture research",
  description:
    "Confirm future requirements, question architecture choices, and inspect independent evidence.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
