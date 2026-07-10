// Marken-Chip mit Standort-Untertitel – die Auswahl-Optik aus dem Kern-Flow
export function CompanyChip({
  name,
  location,
  color,
  isPrivate = false,
  inactive = false,
}: {
  name: string;
  location?: string | null;
  color?: string | null;
  isPrivate?: boolean;
  inactive?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 rounded-xl border border-navy-100 bg-white py-2 pl-2.5 pr-4 shadow-card dark:border-navy-800 dark:bg-navy-900 ${
        inactive ? "opacity-50" : ""
      }`}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: color || "#0B1220" }}
      >
        {initials(name)}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-[11px] text-navy-400">
          {isPrivate ? "Private Ausgaben" : location || "—"}
        </span>
      </span>
    </span>
  );
}

function initials(name: string) {
  const clean = name.replace(/[^\p{L}\p{N} .]/gu, "").trim();
  const parts = clean.split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
