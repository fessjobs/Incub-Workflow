import { MonatForm } from "./monat-form";

export const dynamic = "force-dynamic";

// Personenlink des Monatszettels: Daten werden clientseitig über /api/e/m/[token] geladen.
export default async function MonatTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <MonatForm token={token} />;
}
