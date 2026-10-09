import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "@/preview/ui/preview.css";
import { requireUser } from "@/lib/auth";
import { darfNeu } from "@/lib/neu/auth";

// Neues Dashboard (parallel zum bisherigen System). Nur angemeldete Administratoren;
// nicht für Suchmaschinen.
export const metadata: Metadata = { title: "Neu – Crew und Stunden", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0A1A2F", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default async function NeuLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!darfNeu(user.role)) notFound();
  return (
    <>
      {/* Schriften des fess.jobs-Designs. DSGVO: vor dem produktiven Einsatz selbst hosten. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800&family=Bitter:wght@700&family=Caveat&family=Geist+Mono:wght@400;500&family=Work+Sans:wght@400;500;600;700&display=swap" />
      {children}
    </>
  );
}
