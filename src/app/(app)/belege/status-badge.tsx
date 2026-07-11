import { KIND_LABELS, REIMBURSEMENT_LABELS } from "@/lib/format";

// Status-Badges auf einen Blick (Spec Abschnitt 11)
export function StatusBadge({
  kind,
  approved,
  reimbursement,
}: {
  kind: string;
  approved: boolean;
  reimbursement: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="badge bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-200">
        {KIND_LABELS[kind] ?? kind}
      </span>
      {approved && (
        <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          geprüft
        </span>
      )}
      {kind === "AUSLAGE" && (
        <span
          className={
            reimbursement === "ERSTATTET"
              ? "badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : reimbursement === "EINGEREICHT"
              ? "badge bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              : "badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300"
          }
        >
          {REIMBURSEMENT_LABELS[reimbursement] ?? reimbursement}
        </span>
      )}
    </div>
  );
}
