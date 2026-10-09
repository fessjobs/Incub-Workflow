import type { Metadata, Viewport } from "next";
import "@/preview/ui/preview.css";

export const metadata: Metadata = { title: "Beleg einreichen", robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0A1A2F", width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default function BelegLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bitter:wght@700&family=Geist+Mono:wght@400;500&family=Work+Sans:wght@400;500;600;700&display=swap" />
      {children}
    </>
  );
}
