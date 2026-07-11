import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: {
    default: "incub:workflow",
    template: "%s · incub:workflow",
  },
  description: "Belege. Erledigt. – Auslagen- & Beleg-Tool der incub:live-Unternehmensgruppe",
  applicationName: "incub:workflow",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "incub:workflow" },
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
  width: "device-width",
  initialScale: 1,
};

// Dark Mode ohne Flackern: Klasse vor dem ersten Paint setzen
const themeInit = `
try {
  const t = localStorage.getItem("iw-theme");
  if (t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("dark");
  }
} catch {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
