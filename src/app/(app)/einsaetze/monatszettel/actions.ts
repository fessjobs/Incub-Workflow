"use server";

// Server Actions des Monatszettel-Bereichs (Dispo). organizationId nur aus der Session.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDispo } from "@/lib/einsatz/access";
import { istMonat } from "@/lib/einsatz/monatszettel";
import { entferneLeerenZettel, erstelleLinks, markiereGesendet, MonatsError, setzeKontakt } from "@/lib/einsatz/service/monatszettel";

export type MzResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(err: unknown): MzResult {
  if (err instanceof MonatsError) return { ok: false, error: err.message };
  console.error("Monatszettel-Action fehlgeschlagen:", err instanceof Error ? err.message : err);
  return { ok: false, error: "Das hat nicht geklappt. Bitte noch einmal versuchen." };
}

const LinksSchema = z.object({ customerId: z.string().min(1).max(60), monat: z.string().refine(istMonat, "Ungültiger Monat."), employeeIds: z.array(z.string().max(60)).min(1, "Bitte mindestens eine Person auswählen.").max(200) });

export async function erstelleLinksAction(input: unknown): Promise<MzResult> {
  const user = await requireDispo();
  const p = LinksSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.errors[0].message };
  try {
    const r = await erstelleLinks({ id: user.id, organizationId: user.organizationId }, p.data);
    revalidatePath("/einsaetze/monatszettel");
    return { ok: true, message: r.neu > 0 ? `${r.neu} Monatslink${r.neu === 1 ? "" : "s"} erstellt.` : "Für alle Gewählten gibt es schon einen Link." };
  } catch (err) {
    return fail(err);
  }
}

export async function setzeKontaktAction(batchId: string, kontakt: string): Promise<MzResult> {
  const user = await requireDispo();
  try {
    await setzeKontakt({ id: user.id, organizationId: user.organizationId }, batchId, kontakt);
    revalidatePath("/einsaetze/monatszettel");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function markiereGesendetAction(sheetId: string): Promise<MzResult> {
  const user = await requireDispo();
  try {
    await markiereGesendet({ id: user.id, organizationId: user.organizationId }, sheetId);
    revalidatePath("/einsaetze/monatszettel");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function entferneZettelAction(sheetId: string): Promise<MzResult> {
  const user = await requireDispo();
  try {
    await entferneLeerenZettel({ id: user.id, organizationId: user.organizationId }, sheetId);
    revalidatePath("/einsaetze/monatszettel");
    return { ok: true, message: "Link entfernt." };
  } catch (err) {
    return fail(err);
  }
}
