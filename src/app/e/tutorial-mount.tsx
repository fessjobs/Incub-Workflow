"use client";

// Die Anleitung hängt im Layout, damit sie in jedem Zustand erreichbar ist
// (Liste, Formular, Leseansicht). Welche Fassung gilt, steht im Pfad: der
// Gruppenlink hat einen Schritt mehr – den eigenen Namen antippen.
import { usePathname } from "next/navigation";
import { Tutorial } from "./tutorial";

export function TutorialMount() {
  const pathname = usePathname();
  // Monatszettel (Person und Kunde) erklären sich auf der Seite selbst – die Anleitung für Einzelschichten passt dort nicht
  if (pathname?.startsWith("/e/m/") || pathname?.startsWith("/e/k/")) return null;
  return <Tutorial variante={pathname?.startsWith("/e/crew/") ? "gruppe" : "einzel"} />;
}
