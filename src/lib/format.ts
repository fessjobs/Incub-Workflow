// Gemeinsame Formatierungs-Helfer (deutsche Konventionen).

export function formatEuro(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "–";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "–";
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "–";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MONTHS = [
  "01-Januar", "02-Februar", "03-März", "04-April", "05-Mai", "06-Juni",
  "07-Juli", "08-August", "09-September", "10-Oktober", "11-November", "12-Dezember",
];

export function monthFolder(date: Date): string {
  return MONTHS[date.getMonth()];
}

// Dateinamens-taugliche Variante eines Freitexts (für Ordnerschema Abschnitt 7)
export function slugForFile(input: string, max = 40): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return (cleaned || "Beleg").slice(0, max);
}

export const KIND_LABELS: Record<string, string> = {
  AUSLAGE: "Auslage",
  FIRMENZAHLUNG: "Firmenzahlung",
  PRIVAT: "Privat",
};

export const PAYMENT_LABELS: Record<string, string> = {
  BAR: "Bar",
  PRIVATE_KARTE: "Private Karte",
  FIRMENKARTE: "Firmenkarte",
  UNBEKANNT: "Unbekannt",
};

export const STATUS_LABELS: Record<string, string> = {
  ENTWURF: "Entwurf",
  ABGELEGT: "Abgelegt",
};

export const REIMBURSEMENT_LABELS: Record<string, string> = {
  OFFEN: "Offen",
  EINGEREICHT: "Eingereicht",
  ERSTATTET: "Erstattet",
};
