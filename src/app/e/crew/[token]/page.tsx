import { CrewFlow } from "./crew-flow";

export const dynamic = "force-dynamic";

// Crew-Link für den Ansprechpartner vor Ort: alle Personen unterschreiben
// nacheinander auf einem Gerät, am Ende der Kunde.
export default async function CrewTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CrewFlow token={token} />;
}
