"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { extractPerson, tailorSetcard, type ExtractedPerson } from "@/lib/setcard/extract";
import { themeFor, hasTheme, type SetcardData, type PersonBase, type SetcardExperience } from "@/lib/setcard/themes";
import { renderSetcardPdf } from "@/lib/setcard/pdf";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_BYTES = 15 * 1024 * 1024;

// ─── Schritt 1: Unterlagen auslesen (Uploads werden NICHT gespeichert) ───────

export async function extractPersonAction(formData: FormData): Promise<{ ok: boolean; data?: ExtractedPerson; error?: string }> {
  await requireAdmin();
  const files: Array<{ bytes: Buffer; mime: string }> = [];
  for (const entry of formData.getAll("files")) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > MAX_BYTES) return { ok: false, error: `Datei zu groß (max. 15 MB): ${entry.name}` };
    let mime = entry.type;
    if (!ACCEPTED.includes(mime)) {
      const n = entry.name.toLowerCase();
      if (n.endsWith(".jpg") || n.endsWith(".jpeg")) mime = "image/jpeg";
      else if (n.endsWith(".png")) mime = "image/png";
      else if (n.endsWith(".pdf")) mime = "application/pdf";
      else continue;
    }
    files.push({ bytes: Buffer.from(await entry.arrayBuffer()), mime });
  }
  const freetext = String(formData.get("freetext") ?? "").trim();
  if (files.length === 0 && !freetext) {
    return { ok: false, error: "Bitte Unterlagen hochladen oder Freitext eingeben." };
  }
  const res = await extractPerson(files, freetext);
  if (!res.data) return { ok: false, error: res.error ?? "Auslesen fehlgeschlagen." };
  return { ok: true, data: res.data };
}

// ─── Personal-Stamm ──────────────────────────────────────────────────────────

const personSchema = z.object({
  firstName: z.string().trim().min(1, "Vorname fehlt."),
  lastName: z.string().trim().min(1, "Nachname fehlt."),
  age: z.coerce.number().int().min(14).max(99).optional().nullable(),
  city: z.string().trim().optional().nullable(),
  region: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  languages: z.string().trim().optional().nullable(),
  mobility: z.string().trim().optional().nullable(),
  profileText: z.string().trim().optional().nullable(),
});

export type PersonInput = z.infer<typeof personSchema> & {
  experiences: SetcardExperience[];
  qualifications: string[];
  skills: string[];
  // Foto als Data-URL (client-seitig verkleinert) – leer = unverändert
  photoDataUrl?: string | null;
};

function dataUrlToBytes(dataUrl: string): { bytes: Buffer; mime: string } | null {
  const m = /^data:([a-z/+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  return { bytes: Buffer.from(m[2], "base64"), mime: m[1] };
}

export async function savePersonAction(
  personId: string | null,
  input: PersonInput
): Promise<{ ok: boolean; personId?: string; error?: string }> {
  const admin = await requireAdmin();
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0].message };

  const photo = input.photoDataUrl ? dataUrlToBytes(input.photoDataUrl) : null;
  const data = {
    ...parsed.data,
    age: parsed.data.age ?? null,
    experiences: input.experiences as object[],
    qualifications: input.qualifications,
    skills: input.skills,
    ...(photo ? { photoBytes: new Uint8Array(photo.bytes), photoMime: photo.mime } : {}),
  };

  let id = personId;
  if (personId) {
    const existing = await db.person.findFirst({ where: { id: personId, organizationId: admin.organizationId } });
    if (!existing) return { ok: false, error: "Person nicht gefunden." };
    await db.person.update({ where: { id: personId }, data });
  } else {
    const created = await db.person.create({
      data: { organizationId: admin.organizationId, ...data },
    });
    id = created.id;
  }
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: personId ? "person.update" : "person.create",
    entityType: "person",
    entityId: id ?? undefined,
    data: { name: `${parsed.data.firstName} ${parsed.data.lastName}` },
  });
  revalidatePath("/setcards");
  return { ok: true, personId: id ?? undefined };
}

export async function loadPersonAction(personId: string): Promise<{ ok: boolean; person?: PersonInput & { id: string; hasPhoto: boolean; photoDataUrl: string | null }; error?: string }> {
  const admin = await requireAdmin();
  const p = await db.person.findFirst({ where: { id: personId, organizationId: admin.organizationId } });
  if (!p) return { ok: false, error: "Person nicht gefunden." };
  return {
    ok: true,
    person: {
      id: p.id,
      photoDataUrl: p.photoBytes
        ? `data:${p.photoMime ?? "image/jpeg"};base64,${Buffer.from(p.photoBytes).toString("base64")}`
        : null,
      firstName: p.firstName,
      lastName: p.lastName,
      age: p.age,
      city: p.city,
      region: p.region,
      phone: p.phone,
      email: p.email,
      languages: p.languages,
      mobility: p.mobility,
      profileText: p.profileText,
      experiences: (p.experiences as SetcardExperience[]) ?? [],
      qualifications: (p.qualifications as string[]) ?? [],
      skills: (p.skills as string[]) ?? [],
      hasPhoto: Boolean(p.photoBytes),
    },
  };
}

export async function deletePersonAction(personId: string): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const p = await db.person.findFirst({ where: { id: personId, organizationId: admin.organizationId } });
  if (!p) return { ok: false };
  await db.person.delete({ where: { id: personId } });
  revalidatePath("/setcards");
  return { ok: true };
}

// ─── Schritt 3–5: Vorschau + Speichern ───────────────────────────────────────

async function nextProfileNo(organizationId: string, companyId: string): Promise<string> {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  const count = await db.setcard.count({ where: { organizationId, companyId } });
  const yy = String(new Date().getFullYear()).slice(2);
  return `${company.shortCode}-${yy}${String(count + 1).padStart(2, "0")}`;
}

function toPersonBase(p: {
  firstName: string; lastName: string; age: number | null; city: string | null; region: string | null;
  languages: string | null; mobility: string | null; profileText: string | null;
  experiences: unknown; qualifications: unknown; skills: unknown;
}): PersonBase {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    age: p.age,
    city: p.city,
    region: p.region,
    languages: p.languages,
    mobility: p.mobility,
    profileText: p.profileText,
    experiences: (p.experiences as SetcardExperience[]) ?? [],
    qualifications: (p.qualifications as string[]) ?? [],
    skills: (p.skills as string[]) ?? [],
  };
}

export async function previewSetcardAction(
  personId: string,
  companyId: string,
  einsatzbereich: string,
  hinweise: string | null
): Promise<{ ok: boolean; data?: SetcardData; reused?: boolean; aiUsed?: boolean; error?: string }> {
  const admin = await requireAdmin();
  const person = await db.person.findFirst({ where: { id: personId, organizationId: admin.organizationId } });
  if (!person) return { ok: false, error: "Person nicht gefunden." };
  const company = await db.company.findFirst({ where: { id: companyId, organizationId: admin.organizationId } });
  if (!company || !hasTheme(company.shortCode)) return { ok: false, error: "Für diese Firma gibt es kein Setcard-Design." };
  if (!einsatzbereich.trim()) return { ok: false, error: "Bitte einen Einsatzbereich angeben." };

  const theme = themeFor(company.shortCode);
  const profileNo = await nextProfileNo(admin.organizationId, companyId);

  // Mitlernen: Gab es schon eine Setcard für dieselbe Person + Firma + Bereich,
  // startet die neue mit dem zuletzt (manuell korrigierten) Stand.
  if (!hinweise) {
    const previous = await db.setcard.findFirst({
      where: { organizationId: admin.organizationId, personId, companyId, einsatzbereich: einsatzbereich.trim() },
      orderBy: { createdAt: "desc" },
    });
    if (previous) {
      const data = previous.data as unknown as SetcardData;
      return { ok: true, data: { ...data, profileNo }, reused: true };
    }
  }

  const { data, aiUsed } = await tailorSetcard(toPersonBase(person), theme, einsatzbereich.trim(), profileNo, hinweise);
  return { ok: true, data, aiUsed };
}

export async function saveSetcardAction(
  personId: string,
  companyId: string,
  einsatzbereich: string,
  data: SetcardData
): Promise<{ ok: boolean; setcardId?: string; error?: string }> {
  const admin = await requireAdmin();
  const person = await db.person.findFirst({ where: { id: personId, organizationId: admin.organizationId } });
  if (!person) return { ok: false, error: "Person nicht gefunden." };
  const company = await db.company.findFirst({ where: { id: companyId, organizationId: admin.organizationId } });
  if (!company || !hasTheme(company.shortCode)) return { ok: false, error: "Firma ohne Setcard-Design." };

  const theme = themeFor(company.shortCode);
  // Profil-Nr. beim Speichern endgültig vergeben
  const profileNo = await nextProfileNo(admin.organizationId, companyId);
  const finalData: SetcardData = { ...data, profileNo };

  const photoDataUrl = person.photoBytes
    ? `data:${person.photoMime ?? "image/jpeg"};base64,${Buffer.from(person.photoBytes).toString("base64")}`
    : null;

  let pdf: Buffer;
  try {
    pdf = await renderSetcardPdf(finalData, theme, photoDataUrl);
  } catch (err) {
    console.error("Setcard-PDF fehlgeschlagen:", err);
    return { ok: false, error: "PDF konnte nicht erzeugt werden." };
  }

  const setcard = await db.setcard.create({
    data: {
      organizationId: admin.organizationId,
      personId,
      companyId,
      einsatzbereich: einsatzbereich.trim(),
      profileNo,
      data: finalData as unknown as object,
      pdfBytes: new Uint8Array(pdf),
      createdById: admin.id,
    },
  });
  await logAudit({
    organizationId: admin.organizationId,
    userId: admin.id,
    action: "setcard.create",
    entityType: "setcard",
    entityId: setcard.id,
    data: { profileNo, company: company.brandName, einsatzbereich },
  });
  revalidatePath("/setcards");
  return { ok: true, setcardId: setcard.id };
}

export async function deleteSetcardAction(setcardId: string): Promise<{ ok: boolean }> {
  const admin = await requireAdmin();
  const sc = await db.setcard.findFirst({ where: { id: setcardId, organizationId: admin.organizationId } });
  if (!sc) return { ok: false };
  await db.setcard.delete({ where: { id: setcardId } });
  revalidatePath("/setcards");
  return { ok: true };
}
