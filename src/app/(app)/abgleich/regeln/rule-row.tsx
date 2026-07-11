"use client";

import { useRouter } from "next/navigation";
import { deleteMatchRule } from "../actions";

export function RuleRow({
  rule,
}: {
  rule: { id: string; pattern: string; note: string | null; created: string; count: number };
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">„{rule.pattern}“</span>
      <span className="text-xs text-navy-400">
        ignoriert · {rule.count} Buchungen · seit {rule.created}
      </span>
      <button
        type="button"
        className="btn-danger"
        onClick={async () => {
          await deleteMatchRule(rule.id);
          router.refresh();
        }}
      >
        Aufheben
      </button>
    </div>
  );
}
