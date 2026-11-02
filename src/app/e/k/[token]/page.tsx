import { KundeForm } from "./kunde-form";

export const dynamic = "force-dynamic";

// Kundenlink des Monatszettels: alle Personen eines Monats, eine Unterschrift. Daten über /api/e/k/[token].
export default async function KundeTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <KundeForm token={token} />;
}
