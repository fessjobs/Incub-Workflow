"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { requireDispo } from "@/lib/einsatz/access";
import { EmployeeSchema } from "@/lib/einsatz/schemas";
import { keyToDateOnly } from "@/lib/einsatz/tz";

export type FormState = { error?: string; ok?: boolean };

export async function saveEmployee(employeeId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireDispo();
  const parsed = EmployeeSchema.safeParse({
    vorname: formData.get("vorname"),
    nachname: formData.get("nachname"),
    personalnummer: formData.get("personalnummer"),
    email: formData.get("email"),
    mobil: formData.get("mobil"),
    geburtsdatum: formData.get("geburtsdatum"),
    status: formData.get("status") ?? "AKTIV",
    zulagen: formData.get("zulagen") ?? "",
    zvooveId: formData.get("zvooveId"),
  });
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const d = parsed.data;
  if (d.personalnummer) {
    const conflict = await db.employee.findFirst({ where: { organizationId: user.organizationId, personalnummer: d.personalnummer, ...(employeeId ? { NOT: { id: employeeId } } : {}) } });
    if (conflict) return { error: `Personalnummer ${d.personalnummer} ist bereits vergeben (${conflict.vorname} ${conflict.nachname}).` };
  }
  const zulagen = d.zulagen.split(",").map((z) => z.trim().toLowerCase()).filter(Boolean);
  const data = {
    vorname: d.vorname,
    nachname: d.nachname,
    personalnummer: d.personalnummer ?? null,
    email: d.email ?? null,
    mobil: d.mobil ?? null,
    geburtsdatum: d.geburtsdatum ? keyToDateOnly(d.geburtsdatum) : null,
    status: d.status,
    lohnartDefaults: { zulagen },
    zvooveId: d.zvooveId ?? null,
  };
  if (employeeId) {
    const existing = await db.employee.findFirst({ where: { id: employeeId, organizationId: user.organizationId } });
    if (!existing) return { error: "Mitarbeiter nicht gefunden." };
    await db.employee.update({ where: { id: employeeId }, data });
  } else {
    await db.employee.create({ data: { ...data, organizationId: user.organizationId, createdById: user.id } });
  }
  await logAudit({ organizationId: user.organizationId, userId: user.id, action: employeeId ? "employee.update" : "employee.create", entityType: "employee", entityId: employeeId ?? undefined, data: { name: `${d.vorname} ${d.nachname}`, personalnummer: d.personalnummer ?? null } });
  revalidatePath("/einsaetze/personal");
  return { ok: true };
}
