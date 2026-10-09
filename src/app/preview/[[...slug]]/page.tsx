import { PreviewApp } from "@/preview/app";

// Ein einziger Einstieg für alle Adressen unter /preview: der Prototyp ist eine
// Client-Anwendung und wählt die Seite selbst (siehe src/preview/pages/routes.tsx).
export default function PreviewPage() {
  return <PreviewApp />;
}
