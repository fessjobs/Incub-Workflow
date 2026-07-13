import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import "./mitarbeiter.css";

// fess.jobs Belegtool – eigenes Designsystem (Designkonzept):
// Canvas #FAF8F6, Ink #1A1613, Orange #E8560F als Akzent, Grün #1E8A5B nur
// für "erstattet". Instrument Sans für alles.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "fess.jobs Belegtool",
  description: "Beleg fotografieren, einreichen, Erstattung verfolgen.",
};

export const viewport: Viewport = {
  themeColor: "#FAF8F6",
  width: "device-width",
  initialScale: 1,
};

export default function MitarbeiterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${instrumentSans.className} fess-canvas min-h-screen`}>
      <main className="mx-auto min-h-screen w-full max-w-md px-5 pb-10 pt-6">{children}</main>
    </div>
  );
}
