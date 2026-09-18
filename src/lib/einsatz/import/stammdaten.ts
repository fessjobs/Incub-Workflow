// Import von Mitarbeiter- und Kundenstammdaten: Datei einlesen, Spalten
// erkennen, Vorschau mit Befund je Zeile (neu / Aktualisierung / Fehler),
// danach auf Bestätigung übernehmen. Bestehende Datensätze werden anhand von
// Personalnummer bzw. Name erkannt und ergänzt, nie doppelt angelegt.
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isValidDateKey, keyToDateOnly } from "../tz";
import { erkenneSpalten, parseTabelle, zelle, type FeldDefinition } from "./parse-table";

export type Befund = "neu" | "aktualisierung" | "unveraendert" | "fehler";

export type VorschauZeile = {
  nr: number;
  befund: Befund;
  meldung: string | null;
  // Anzeige in der Vorschau
  werte: Record<string, string>;
  // vorhandener Datensatz, der ergänzt würde
  vorhandenId: string | null;
};

export type Vorschau = {
  kopf: string[];
  erkannt: Record<string, string>;
  fehlendePflicht: string[];
  zeilen: VorschauZeile[];
  zusammenfassung: { neu: number; aktualisierung: number; unveraendert: number; fehler: number };
};

// ─── Mitarbeiter ────────────────────────────────────────────────────────────

type MitarbeiterFeld = "vorname" | "nachname" | "name" | "personalnummer" | "email" | "mobil" | "geburtsdatum" | "zulagen" | "status";

const MITARBEITER_FELDER: Array<FeldDefinition<MitarbeiterFeld>> = [
  { feld: "personalnummer", muster: /^(personalnummer|persnr|persnummer|pnr|mitarbeiternummer|manr|mitarbeiternr|nummer)$/ },
  { feld: "vorname", muster: /^(vorname|firstname|rufname)$/ },
  { feld: "nachname", muster: /^(nachname|name|familienname|lastname|surname)$/ },
  { feld: "name", muster: /^(vollername|vollstaendigername|mitarbeiter|person|namevollstaendig)$/ },
  { feld: "email", muster: /^(email|emailadresse|mail|mailadresse|epost)$/ },
  { feld: "mobil", muster: /^(mobil|handy|telefon|mobilnummer|handynummer|tel|telefonnummer)$/ },
  { feld: "geburtsdatum", muster: /^(geburtsdatum|geburtstag|gebdatum|geb|birthday)$/ },
  { feld: "zulagen", muster: /^(zulagen|qualifikationen|qualifikation|skills|faehigkeiten|scheine)$/ },
  { feld: "status", muster: /^(status|aktiv|zustand)$/ },
];

// "Mustermann, Max" oder "Max Mustermann" aufteilen
export function teileName(voll: string): { vorname: string; nachname: string } {
  const text = voll.trim().replace(/\s+/g, " ");
  if (text.includes(",")) {
    const [nach, vor] = text.split(",");
    return { vorname: (vor ?? "").trim(), nachname: (nach ?? "").trim() };
  }
  const teile = text.split(" ");
  if (teile.length === 1) return { vorname: teile[0], nachname: "" };
  return { vorname: teile.slice(0, -1).join(" "), nachname: teile[teile.length - 1] };
}

export function parseDatum(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (isValidDateKey(t)) return t;
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (de) {
    const jahr = de[3].length === 2 ? (Number(de[3]) > 40 ? `19${de[3]}` : `20${de[3]}`) : de[3];
    const key = `${jahr}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
    return isValidDateKey(key) ? key : null;
  }
  return null;
}

export type MitarbeiterSatz = {
  vorname: string;
  nachname: string;
  personalnummer: string | null;
  email: string | null;
  mobil: string | null;
  geburtsdatum: string | null;
  zulagen: string[];
  status: "AKTIV" | "INAKTIV";
};

export function leseMitarbeiterZeile(zeile: string[], sp: Record<MitarbeiterFeld, number>): { satz: MitarbeiterSatz | null; fehler: string | null } {
  let vorname = zelle(zeile, sp.vorname);
  let nachname = zelle(zeile, sp.nachname);
  const voll = zelle(zeile, sp.name);
  // Nur eine Namensspalte: aufteilen. Steht der ganze Name in "Nachname"
  // (häufig bei Exporten), ebenfalls aufteilen.
  if (!vorname && voll) ({ vorname, nachname } = teileName(voll));
  else if (!vorname && nachname.includes(" ")) ({ vorname, nachname } = teileName(nachname));
  else if (!vorname && nachname.includes(",")) ({ vorname, nachname } = teileName(nachname));
  if (!vorname && !nachname) return { satz: null, fehler: "Kein Name in der Zeile" };
  if (!nachname) return { satz: null, fehler: `Nachname fehlt (nur „${vorname}“)` };
  // Die Konkretisierung nach AÜG benennt die Person namentlich – ein
  // einteiliger Eintrag taugt dafür nicht und wird nicht still übernommen.
  if (!vorname) return { satz: null, fehler: `Vorname fehlt (nur „${nachname}“)` };

  const email = zelle(zeile, sp.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { satz: null, fehler: `Ungültige E-Mail „${email}“` };
  const geb = zelle(zeile, sp.geburtsdatum);
  if (geb && !parseDatum(geb)) return { satz: null, fehler: `Geburtsdatum „${geb}“ nicht lesbar` };
  const statusText = zelle(zeile, sp.status).toLowerCase();
  const status: "AKTIV" | "INAKTIV" = /inaktiv|gesperrt|aus|nein|0|false/.test(statusText) && statusText !== "" ? "INAKTIV" : "AKTIV";

  return {
    satz: {
      vorname,
      nachname,
      personalnummer: zelle(zeile, sp.personalnummer) || null,
      email: email || null,
      mobil: zelle(zeile, sp.mobil) || null,
      geburtsdatum: geb ? parseDatum(geb) : null,
      zulagen: zelle(zeile, sp.zulagen).split(/[,;/]/).map((z) => z.trim().toLowerCase()).filter(Boolean),
      status,
    },
    fehler: null,
  };
}

export async function vorschauMitarbeiter(organizationId: string, bytes: Buffer, filename: string): Promise<Vorschau> {
  const tabelle = await parseTabelle(bytes, filename);
  const sp = erkenneSpalten(tabelle.kopf, MITARBEITER_FELDER);
  const fehlendePflicht: string[] = [];
  if (sp.vorname < 0 && sp.nachname < 0 && sp.name < 0) fehlendePflicht.push("Name");

  const vorhandene = await db.employee.findMany({
    where: { organizationId },
    select: { id: true, vorname: true, nachname: true, personalnummer: true, email: true, mobil: true },
  });
  const nachNummer = new Map(vorhandene.filter((e) => e.personalnummer).map((e) => [e.personalnummer!, e]));
  const nachName = new Map(vorhandene.map((e) => [`${e.vorname} ${e.nachname}`.toLowerCase(), e]));

  const zeilen: VorschauZeile[] = tabelle.zeilen.map((z, i) => {
    const { satz, fehler } = leseMitarbeiterZeile(z, sp);
    if (!satz) {
      return { nr: i + 1, befund: "fehler", meldung: fehler, werte: { Zeile: z.filter(Boolean).join(" | ").slice(0, 120) }, vorhandenId: null };
    }
    const treffer = (satz.personalnummer ? nachNummer.get(satz.personalnummer) : undefined) ?? nachName.get(`${satz.vorname} ${satz.nachname}`.toLowerCase());
    const werte: Record<string, string> = {
      Personalnummer: satz.personalnummer ?? "–",
      Nachname: satz.nachname,
      Vorname: satz.vorname,
      "E-Mail": satz.email ?? "–",
      Mobil: satz.mobil ?? "–",
      Zulagen: satz.zulagen.join(", ") || "–",
    };
    if (!treffer) return { nr: i + 1, befund: "neu", meldung: null, werte, vorhandenId: null };
    const unveraendert =
      (satz.personalnummer ?? null) === (treffer.personalnummer ?? null) &&
      (satz.email ?? null) === (treffer.email ?? null) &&
      (satz.mobil ?? null) === (treffer.mobil ?? null);
    return {
      nr: i + 1,
      befund: unveraendert ? "unveraendert" : "aktualisierung",
      meldung: `Vorhanden: ${treffer.vorname} ${treffer.nachname}`,
      werte,
      vorhandenId: treffer.id,
    };
  });

  return {
    kopf: tabelle.kopf,
    erkannt: Object.fromEntries(Object.entries(sp).filter(([, i]) => (i as number) >= 0).map(([f, i]) => [f, tabelle.kopf[i as number]])),
    fehlendePflicht,
    zeilen,
    zusammenfassung: zaehle(zeilen),
  };
}

export async function importiereMitarbeiter(
  actor: { id: string; organizationId: string },
  bytes: Buffer,
  filename: string,
  optionen: { aktualisieren: boolean }
): Promise<{ neu: number; aktualisiert: number; uebersprungen: number; fehler: Array<{ nr: number; meldung: string }> }> {
  const tabelle = await parseTabelle(bytes, filename);
  const sp = erkenneSpalten(tabelle.kopf, MITARBEITER_FELDER);
  const ergebnis = { neu: 0, aktualisiert: 0, uebersprungen: 0, fehler: [] as Array<{ nr: number; meldung: string }> };

  for (const [i, z] of tabelle.zeilen.entries()) {
    const { satz, fehler } = leseMitarbeiterZeile(z, sp);
    if (!satz) {
      if (fehler) ergebnis.fehler.push({ nr: i + 1, meldung: fehler });
      continue;
    }
    try {
      const vorhanden =
        (satz.personalnummer
          ? await db.employee.findFirst({ where: { organizationId: actor.organizationId, personalnummer: satz.personalnummer } })
          : null) ??
        (await db.employee.findFirst({
          where: { organizationId: actor.organizationId, vorname: { equals: satz.vorname, mode: "insensitive" }, nachname: { equals: satz.nachname, mode: "insensitive" } },
        }));

      const daten = {
        vorname: satz.vorname,
        nachname: satz.nachname,
        personalnummer: satz.personalnummer,
        email: satz.email,
        mobil: satz.mobil,
        geburtsdatum: satz.geburtsdatum ? keyToDateOnly(satz.geburtsdatum) : null,
        status: satz.status,
        lohnartDefaults: { zulagen: satz.zulagen },
      };

      if (vorhanden) {
        if (!optionen.aktualisieren) {
          ergebnis.uebersprungen++;
          continue;
        }
        // Personalnummer eines anderen Datensatzes darf nicht überschrieben werden
        if (satz.personalnummer) {
          const konflikt = await db.employee.findFirst({
            where: { organizationId: actor.organizationId, personalnummer: satz.personalnummer, NOT: { id: vorhanden.id } },
          });
          if (konflikt) {
            ergebnis.fehler.push({ nr: i + 1, meldung: `Personalnummer ${satz.personalnummer} gehört bereits ${konflikt.vorname} ${konflikt.nachname}` });
            continue;
          }
        }
        // Leere Felder in der Datei überschreiben nichts Bestehendes
        await db.employee.update({
          where: { id: vorhanden.id },
          data: {
            ...daten,
            personalnummer: satz.personalnummer ?? vorhanden.personalnummer,
            email: satz.email ?? vorhanden.email,
            mobil: satz.mobil ?? vorhanden.mobil,
            geburtsdatum: satz.geburtsdatum ? keyToDateOnly(satz.geburtsdatum) : vorhanden.geburtsdatum,
            lohnartDefaults: satz.zulagen.length > 0 ? { zulagen: satz.zulagen } : (vorhanden.lohnartDefaults ?? undefined),
          },
        });
        ergebnis.aktualisiert++;
      } else {
        if (satz.personalnummer) {
          const konflikt = await db.employee.findFirst({ where: { organizationId: actor.organizationId, personalnummer: satz.personalnummer } });
          if (konflikt) {
            ergebnis.fehler.push({ nr: i + 1, meldung: `Personalnummer ${satz.personalnummer} ist bereits vergeben (${konflikt.vorname} ${konflikt.nachname})` });
            continue;
          }
        }
        await db.employee.create({ data: { ...daten, organizationId: actor.organizationId, createdById: actor.id } });
        ergebnis.neu++;
      }
    } catch (err) {
      ergebnis.fehler.push({ nr: i + 1, meldung: err instanceof Error ? err.message.slice(0, 160) : "Unbekannter Fehler" });
    }
  }

  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "employee.import",
    entityType: "employee",
    data: { datei: filename, ...ergebnis, fehler: ergebnis.fehler.length },
  });
  return ergebnis;
}

// ─── Kunden ─────────────────────────────────────────────────────────────────

type KundeFeld = "name" | "adresse" | "plz" | "ort" | "ustid" | "ansprechpartner" | "email" | "telefon" | "einsatzort" | "bundesland" | "vertrag";

const KUNDE_FELDER: Array<FeldDefinition<KundeFeld>> = [
  { feld: "name", muster: /^(name|kunde|kundenname|firma|firmenname|auftraggeber|entleiher|unternehmen)$/ },
  { feld: "adresse", muster: /^(adresse|anschrift|strasse|strassehausnummer|str)$/ },
  { feld: "plz", muster: /^(plz|postleitzahl|zip)$/ },
  { feld: "ort", muster: /^(ort|stadt|city)$/ },
  { feld: "ustid", muster: /^(ustid|ustidnr|umsatzsteuerid|vatid|steuernummer)$/ },
  { feld: "ansprechpartner", muster: /^(ansprechpartner|kontakt|kontaktperson|apartner|ap)$/ },
  { feld: "email", muster: /^(email|emailadresse|mail|kontaktemail)$/ },
  { feld: "telefon", muster: /^(telefon|tel|telefonnummer|mobil|handy)$/ },
  { feld: "einsatzort", muster: /^(einsatzort|standardeinsatzort|standort|location)$/ },
  { feld: "bundesland", muster: /^(bundesland|land|region)$/ },
  { feld: "vertrag", muster: /^(vertrag|auevertrag|auevertragref|vertragsnummer|aunummer)$/ },
];

const BUNDESLAND_NAMEN: Record<string, string> = {
  badenwuerttemberg: "BW", bayern: "BY", berlin: "BE", brandenburg: "BB", bremen: "HB", hamburg: "HH",
  hessen: "HE", mecklenburgvorpommern: "MV", niedersachsen: "NI", nordrheinwestfalen: "NW",
  rheinlandpfalz: "RP", saarland: "SL", sachsen: "SN", sachsenanhalt: "ST", schleswigholstein: "SH", thueringen: "TH",
};

export function leseBundesland(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  // Umlaute ausschreiben, BEVOR die Zerlegung sie zu blossen Vokalen macht
  // (sonst würde aus "Württemberg" ein "wurttemberg" und der Schlüssel
  // "badenwuerttemberg" fände nichts). NFC vorweg, weil ein "ü" auch als
  // u + Umlautpunkte geliefert werden kann.
  const key = t
    .normalize("NFC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z]/g, "");
  return BUNDESLAND_NAMEN[key] ?? null;
}

export type KundeSatz = {
  name: string;
  adresse: string | null;
  ustid: string | null;
  ansprechpartner: string | null;
  ansprechpartnerEmail: string | null;
  ansprechpartnerTelefon: string | null;
  standardEinsatzort: string | null;
  bundesland: string | null;
  aueVertragRef: string | null;
};

export function leseKundeZeile(zeile: string[], sp: Record<KundeFeld, number>): { satz: KundeSatz | null; fehler: string | null } {
  const name = zelle(zeile, sp.name);
  if (!name) return { satz: null, fehler: "Kein Kundenname in der Zeile" };
  const email = zelle(zeile, sp.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { satz: null, fehler: `Ungültige E-Mail „${email}“` };
  // Adresse aus Straße, PLZ und Ort zusammensetzen, wenn getrennt geliefert
  const teile = [zelle(zeile, sp.adresse), [zelle(zeile, sp.plz), zelle(zeile, sp.ort)].filter(Boolean).join(" ")].filter(Boolean);
  return {
    satz: {
      name,
      adresse: teile.join(", ") || null,
      ustid: zelle(zeile, sp.ustid) || null,
      ansprechpartner: zelle(zeile, sp.ansprechpartner) || null,
      ansprechpartnerEmail: email || null,
      ansprechpartnerTelefon: zelle(zeile, sp.telefon) || null,
      standardEinsatzort: zelle(zeile, sp.einsatzort) || null,
      bundesland: leseBundesland(zelle(zeile, sp.bundesland)),
      aueVertragRef: zelle(zeile, sp.vertrag) || null,
    },
    fehler: null,
  };
}

export async function vorschauKunden(organizationId: string, bytes: Buffer, filename: string): Promise<Vorschau> {
  const tabelle = await parseTabelle(bytes, filename);
  const sp = erkenneSpalten(tabelle.kopf, KUNDE_FELDER);
  const fehlendePflicht = sp.name < 0 ? ["Name"] : [];
  const vorhandene = await db.customer.findMany({ where: { organizationId }, select: { id: true, name: true, adresse: true, ansprechpartner: true } });
  const nachName = new Map(vorhandene.map((c) => [c.name.toLowerCase(), c]));

  const zeilen: VorschauZeile[] = tabelle.zeilen.map((z, i) => {
    const { satz, fehler } = leseKundeZeile(z, sp);
    if (!satz) return { nr: i + 1, befund: "fehler", meldung: fehler, werte: { Zeile: z.filter(Boolean).join(" | ").slice(0, 120) }, vorhandenId: null };
    const treffer = nachName.get(satz.name.toLowerCase());
    const werte: Record<string, string> = {
      Name: satz.name,
      Adresse: satz.adresse ?? "–",
      Ansprechpartner: satz.ansprechpartner ?? "–",
      Einsatzort: satz.standardEinsatzort ?? "–",
      Bundesland: satz.bundesland ?? "–",
      "AÜ-Vertrag": satz.aueVertragRef ?? "–",
    };
    if (!treffer) return { nr: i + 1, befund: "neu", meldung: null, werte, vorhandenId: null };
    const unveraendert = (satz.adresse ?? null) === (treffer.adresse ?? null) && (satz.ansprechpartner ?? null) === (treffer.ansprechpartner ?? null);
    return { nr: i + 1, befund: unveraendert ? "unveraendert" : "aktualisierung", meldung: `Vorhanden: ${treffer.name}`, werte, vorhandenId: treffer.id };
  });

  return {
    kopf: tabelle.kopf,
    erkannt: Object.fromEntries(Object.entries(sp).filter(([, i]) => (i as number) >= 0).map(([f, i]) => [f, tabelle.kopf[i as number]])),
    fehlendePflicht,
    zeilen,
    zusammenfassung: zaehle(zeilen),
  };
}

export async function importiereKunden(
  actor: { id: string; organizationId: string },
  bytes: Buffer,
  filename: string,
  optionen: { aktualisieren: boolean }
): Promise<{ neu: number; aktualisiert: number; uebersprungen: number; fehler: Array<{ nr: number; meldung: string }> }> {
  const tabelle = await parseTabelle(bytes, filename);
  const sp = erkenneSpalten(tabelle.kopf, KUNDE_FELDER);
  const ergebnis = { neu: 0, aktualisiert: 0, uebersprungen: 0, fehler: [] as Array<{ nr: number; meldung: string }> };

  for (const [i, z] of tabelle.zeilen.entries()) {
    const { satz, fehler } = leseKundeZeile(z, sp);
    if (!satz) {
      if (fehler) ergebnis.fehler.push({ nr: i + 1, meldung: fehler });
      continue;
    }
    try {
      const vorhanden = await db.customer.findFirst({ where: { organizationId: actor.organizationId, name: { equals: satz.name, mode: "insensitive" } } });
      if (vorhanden) {
        if (!optionen.aktualisieren) {
          ergebnis.uebersprungen++;
          continue;
        }
        await db.customer.update({
          where: { id: vorhanden.id },
          data: {
            adresse: satz.adresse ?? vorhanden.adresse,
            ustid: satz.ustid ?? vorhanden.ustid,
            ansprechpartner: satz.ansprechpartner ?? vorhanden.ansprechpartner,
            ansprechpartnerEmail: satz.ansprechpartnerEmail ?? vorhanden.ansprechpartnerEmail,
            ansprechpartnerTelefon: satz.ansprechpartnerTelefon ?? vorhanden.ansprechpartnerTelefon,
            standardEinsatzort: satz.standardEinsatzort ?? vorhanden.standardEinsatzort,
            bundesland: satz.bundesland ?? vorhanden.bundesland,
            aueVertragRef: satz.aueVertragRef ?? vorhanden.aueVertragRef,
          },
        });
        ergebnis.aktualisiert++;
      } else {
        await db.customer.create({ data: { ...satz, organizationId: actor.organizationId, createdById: actor.id } });
        ergebnis.neu++;
      }
    } catch (err) {
      ergebnis.fehler.push({ nr: i + 1, meldung: err instanceof Error ? err.message.slice(0, 160) : "Unbekannter Fehler" });
    }
  }

  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "customer.import",
    entityType: "customer",
    data: { datei: filename, ...ergebnis, fehler: ergebnis.fehler.length },
  });
  return ergebnis;
}

function zaehle(zeilen: VorschauZeile[]) {
  return {
    neu: zeilen.filter((z) => z.befund === "neu").length,
    aktualisierung: zeilen.filter((z) => z.befund === "aktualisierung").length,
    unveraendert: zeilen.filter((z) => z.befund === "unveraendert").length,
    fehler: zeilen.filter((z) => z.befund === "fehler").length,
  };
}
