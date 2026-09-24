export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  ENTWURF: "Entwurf",
  KONKRETISIERT: "Konkretisiert",
  LAUFEND: "Laufend",
  ABGESCHLOSSEN: "Abgeschlossen",
  ABGERECHNET: "Abgerechnet",
};

export const REVIEW_LABELS: Record<string, string> = {
  ERFASST: "Erfasst",
  GEPRUEFT: "Geprüft",
  FREIGEGEBEN: "Freigegeben",
};

export const SA_STATUS_LABELS: Record<string, string> = {
  GEPLANT: "Geplant",
  BESTAETIGT: "Bestätigt",
  ERFASST: "Erfasst",
  FREIGEGEBEN: "Freigegeben",
  STORNIERT: "Storniert",
};

const CLASSES: Record<string, string> = {
  ENTWURF: "badge bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-200",
  KONKRETISIERT: "badge-accent",
  LAUFEND: "badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ABGESCHLOSSEN: "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  ABGERECHNET: "badge bg-navy-900 text-white dark:bg-white dark:text-navy-900",
  ERFASST: "badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  GEPRUEFT: "badge-accent",
  FREIGEGEBEN: "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  GEPLANT: "badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300",
  BESTAETIGT: "badge bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-200",
  STORNIERT: "badge bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function StatusBadge({ status }: { status: string }) {
  const label = ASSIGNMENT_STATUS_LABELS[status] ?? REVIEW_LABELS[status] ?? SA_STATUS_LABELS[status] ?? status;
  return <span className={CLASSES[status] ?? "badge bg-navy-100 text-navy-600"}>{label}</span>;
}

// Abrechnung als eigenes Kürzel – bewusst getrennt vom Einsatzstatus, damit
// in der Liste auf einen Blick sichtbar ist, was die Buchhaltung noch braucht.
export const ABRECHNUNG_BADGE: Record<string, { label: string; klasse: string }> = {
  OFFEN: { label: "offen", klasse: "badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  FREIGEGEBEN: { label: "freigegeben", klasse: "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  BERECHNET: { label: "berechnet", klasse: "badge bg-navy-900 text-white dark:bg-white dark:text-navy-900" },
};

export function AbrechnungBadge({ stand }: { stand: string }) {
  const b = ABRECHNUNG_BADGE[stand] ?? { label: stand, klasse: "badge bg-navy-100 text-navy-600" };
  return (
    <span className={b.klasse} title={`Abrechnung: ${b.label}`} data-testid={`abrechnung-badge-${stand.toLowerCase()}`}>
      {b.label}
    </span>
  );
}
