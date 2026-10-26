import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Booking lab — Forecode fixture",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
