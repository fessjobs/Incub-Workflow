import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import "@/preview/ui/preview.css";
import { PREVIEW_COOKIE, previewAktiv, zugangsToken } from "./gate";
import { Sperre } from "./sperre";

// Nie in Suchmaschinen, nie zwischengespeichert
export const metadata: Metadata = {
  title: "Testversion",
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
};
export const viewport: Viewport = { themeColor: "#0A1A2F", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default async function PreviewLayout({ children }: { children: React.ReactNode }) {
  // Ohne Flag gibt es /preview nicht – für niemanden
  if (!previewAktiv()) notFound();
  const erwartet = zugangsToken();
  const cookie = (await cookies()).get(PREVIEW_COOKIE)?.value;
  const frei = erwartet !== null && cookie === erwartet;
  return (
    <>
      {/* Schriften des fess.jobs-Designs. DSGVO: für die echte Umsetzung selbst hosten. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Bitter:wght@700&family=Caveat&family=Geist+Mono:wght@400;500&family=Work+Sans:wght@400;500;600;700&display=swap"
      />
      {frei ? children : <Sperre />}
    </>
  );
}
