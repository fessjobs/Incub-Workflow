import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./mitarbeiter.css";

// fess.jobs Belegtool – eigenes Designsystem (Designkonzept):
// Canvas #FAF8F6, Ink #1A1613, Orange #E8560F als Akzent, Grün #1E8A5B nur
// für "erstattet". Instrument Sans (Variable, 400–700) liegt im Repo –
// kein Download zur Bauzeit (Google Fonts ist im Railway-Build blockiert).
const instrumentSans = localFont({
  src: "../../fonts/instrument-sans-latin.woff2",
  weight: "400 700",
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
