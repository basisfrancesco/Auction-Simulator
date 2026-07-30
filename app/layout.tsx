import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auction Simulator — Aste automobilistiche",
  description: "Area riservata per partecipare e gestire aste automobilistiche.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
