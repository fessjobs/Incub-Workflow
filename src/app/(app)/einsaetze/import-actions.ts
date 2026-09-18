"use server";

// Server Actions für die Stammdaten-Importe. Der Upload läuft in zwei
// Schritten: erst Vorschau (nichts wird gespeichert), dann Übernahme.
import { revalidatePath } from "next/cache";
import { requireDispo } from "@/lib/einsatz/access";
import { importiereKunden, importiereMitarbeiter, vorschauKunden, vorschauMitarbeiter, type Vorschau } from "@/lib/einsatz/import/stammdaten";

const MAX_BYTES = 10 * 1024 * 1024;

export type VorschauErgebnis = { ok: true; vorschau: Vorschau; dateiname: string } | { ok: false; error: string };
export type ImportErgebnis =
  | { ok: true; neu: number; aktualisiert: number; uebersprungen: number; fehler: Array<{ nr: number; meldung: string }> }
  | { ok: false; error: string };

// Beide Schritte laufen über dasselbe Formular, damit die gewählte Datei
// erhalten bleibt: "vorschau" zeigt nur an, "import" übernimmt.
export type SchrittErgebnis = { vorschau: VorschauErgebnis | null; import: ImportErgebnis | null };

async function leseDatei(formData: FormData): Promise<{ bytes: Buffer; name: string } | { error: string }> {
  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return { error: "Bitte eine Datei auswählen." };
  if (datei.size > MAX_BYTES) return { error: "Die Datei ist größer als 10 MB." };
  return { bytes: Buffer.from(await datei.arrayBuffer()), name: datei.name };
}

function fehlertext(err: unknown): string {
  const m = err instanceof Error ? err.message : "Unbekannter Fehler";
  console.error("Stammdaten-Import:", m);
  return m.slice(0, 200);
}

export async function vorschauMitarbeiterAction(_prev: VorschauErgebnis | null, formData: FormData): Promise<VorschauErgebnis> {
  const user = await requireDispo();
  const datei = await leseDatei(formData);
  if ("error" in datei) return { ok: false, error: datei.error };
  try {
    return { ok: true, vorschau: await vorschauMitarbeiter(user.organizationId, datei.bytes, datei.name), dateiname: datei.name };
  } catch (err) {
    return { ok: false, error: fehlertext(err) };
  }
}

export async function importMitarbeiterAction(_prev: ImportErgebnis | null, formData: FormData): Promise<ImportErgebnis> {
  const user = await requireDispo();
  const datei = await leseDatei(formData);
  if ("error" in datei) return { ok: false, error: datei.error };
  try {
    const res = await importiereMitarbeiter({ id: user.id, organizationId: user.organizationId }, datei.bytes, datei.name, {
      aktualisieren: formData.get("aktualisieren") === "on",
    });
    revalidatePath("/einsaetze/personal");
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: fehlertext(err) };
  }
}

export async function vorschauKundenAction(_prev: VorschauErgebnis | null, formData: FormData): Promise<VorschauErgebnis> {
  const user = await requireDispo();
  const datei = await leseDatei(formData);
  if ("error" in datei) return { ok: false, error: datei.error };
  try {
    return { ok: true, vorschau: await vorschauKunden(user.organizationId, datei.bytes, datei.name), dateiname: datei.name };
  } catch (err) {
    return { ok: false, error: fehlertext(err) };
  }
}

export async function importKundenAction(_prev: ImportErgebnis | null, formData: FormData): Promise<ImportErgebnis> {
  const user = await requireDispo();
  const datei = await leseDatei(formData);
  if ("error" in datei) return { ok: false, error: datei.error };
  try {
    const res = await importiereKunden({ id: user.id, organizationId: user.organizationId }, datei.bytes, datei.name, {
      aktualisieren: formData.get("aktualisieren") === "on",
    });
    revalidatePath("/einsaetze/kunden");
    return { ok: true, ...res };
  } catch (err) {
    return { ok: false, error: fehlertext(err) };
  }
}

export async function mitarbeiterSchrittAction(_prev: SchrittErgebnis | null, formData: FormData): Promise<SchrittErgebnis> {
  const istImport = formData.get("schritt") === "import";
  if (istImport) {
    const res = await importMitarbeiterAction(null, formData);
    // Nach der Übernahme die Vorschau frisch aufbauen (zeigt dann "unverändert")
    return { vorschau: await vorschauMitarbeiterAction(null, formData), import: res };
  }
  return { vorschau: await vorschauMitarbeiterAction(null, formData), import: null };
}

export async function kundenSchrittAction(_prev: SchrittErgebnis | null, formData: FormData): Promise<SchrittErgebnis> {
  const istImport = formData.get("schritt") === "import";
  if (istImport) {
    const res = await importKundenAction(null, formData);
    return { vorschau: await vorschauKundenAction(null, formData), import: res };
  }
  return { vorschau: await vorschauKundenAction(null, formData), import: null };
}
