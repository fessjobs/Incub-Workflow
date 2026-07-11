"use client";

import Link from "next/link";
import { KIND_LABELS } from "@/lib/format";

export function UnpaidReceiptRow({
  receipt,
}: {
  receipt: {
    id: string;
    receiptNumber: string | null;
    vendor: string;
    amount: string;
    date: string;
    company: string;
    user: string;
    kind: string;
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 text-sm">
      <Link href={`/belege/${receipt.id}`} className="font-mono text-xs hover:underline">
        {receipt.receiptNumber}
      </Link>
      <span className="min-w-0 flex-1 truncate font-medium">{receipt.vendor}</span>
      <span className="text-navy-400">{receipt.company}</span>
      <span className="text-navy-400">{receipt.user}</span>
      <span className="text-navy-400">{receipt.date}</span>
      <span className="tabular-nums font-medium">{receipt.amount}</span>
      <span className="badge bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300">
        {KIND_LABELS[receipt.kind] ?? receipt.kind}
      </span>
    </div>
  );
}
