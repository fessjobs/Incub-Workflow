import { EntryForm } from "./entry-form";

export const dynamic = "force-dynamic";

// Mitarbeiter-Link: Daten werden clientseitig über /api/e/[token] geladen,
// damit die Seite offline (Service Worker + IndexedDB) weiterarbeiten kann.
export default async function EmployeeTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <EntryForm token={token} />;
}
