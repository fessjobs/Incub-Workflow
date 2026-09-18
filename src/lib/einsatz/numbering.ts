// Einsatznummer JJJJ-MMTT-lfd, laufende Nummer je Mandant und Kalendertag des
// Einsatzbeginns. Transaktional über einen Zähler (kein Race bei parallelem
// Anlegen).
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export function dayKeyForNumber(dateKey: string): string {
  // "2026-09-18" → "2026-0918"
  return `${dateKey.slice(0, 4)}-${dateKey.slice(5, 7)}${dateKey.slice(8, 10)}`;
}

export async function nextEinsatznummer(organizationId: string, dateKey: string, tx?: Prisma.TransactionClient): Promise<string> {
  const client = tx ?? db;
  const day = dayKeyForNumber(dateKey);
  const counter = await client.assignmentNumberCounter.upsert({
    where: { organizationId_day: { organizationId, day } },
    create: { organizationId, day, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${day}-${String(counter.lastNumber).padStart(2, "0")}`;
}
