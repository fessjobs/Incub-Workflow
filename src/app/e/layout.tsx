import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./e.css";
import { SwRegister } from "./sw-register";

// Mitarbeiter-Link des Einsatzmoduls: eigenes, helles Design (fess.jobs,
// Akzent #E3682E), ohne App-Navigation, ohne Login.
const instrumentSans = localFont({
  src: "../../fonts/instrument-sans-latin.woff2",
  weight: "400 700",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stundennachweis · fess.jobs",
  description: "Zeiten prüfen, Unterweisung bestätigen, unterschreiben.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#FAF8F6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function EinsatzLinkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${instrumentSans.className} ez`}>
      <main className="ez-wrap">{children}</main>
      <SwRegister />
    </div>
  );
}
