// Stundennachweis je Einsatz: Ist-Zeiten aller Personen mit Unterschrift,
// Fahrten, Kundenbestätigung, Bestätigungstext und Anlage
// "Sicherheitsunterweisung und PSA" (zweispaltig, versioniert).
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { CONFIRMATION_TEXT, SAFETY_SECTIONS, SAFETY_STAND, SAFETY_VERSION, VERLEIHER } from "../safety";
import { INK, LINE, MUTED, Meta, ORANGE, PdfFooter, PdfHeader, SOFT, Table, pdf } from "./layout";

export type StundennachweisRow = {
  nr: number;
  name: string;
  schicht: string;
  datum: string;
  start: string;
  pause: string;
  ende: string;
  gesamt: string;
  taetigkeit: string;
  pkw: string;
  spesen: string;
  notiz: string;
  signature: Buffer | null;
  unterschriftZeitpunkt: string | null;
  status: "unterschrieben" | "offen" | "korrigiert";
};

export type StundennachweisData = {
  einsatznummer: string;
  projekt: string;
  artist: string | null;
  entleiher: { name: string; adresse: string | null };
  einsatzort: string;
  datumVon: string;
  datumBis: string;
  einsatzbereich: string | null;
  aueVertragRef: string | null;
  erstelltAm: string;
  zeilen: StundennachweisRow[];
  fahrten: Array<{ person: string; fahrzeugart: string; strecken: Array<{ von: string; nach: string; km: string }>; summe: string }>;
  kunde: { name: string; signature: Buffer | null; zeitpunkt: string } | null;
  summeStunden: string;
  unterweisungVersion: string;
  hinweise: string[];
};

function SignatureCell({ row }: { row: StundennachweisRow }) {
  if (row.signature) {
    return (
      <View>
        <Image style={pdf.signImage} src={{ data: row.signature, format: "png" }} />
        <Text style={{ fontSize: 5.5, color: MUTED }}>{row.unterschriftZeitpunkt ?? ""}</Text>
      </View>
    );
  }
  return <Text style={{ fontSize: 7, color: row.status === "offen" ? ORANGE : MUTED }}>{row.status === "offen" ? "nicht unterschrieben" : "–"}</Text>;
}

function StundennachweisDocument({ data }: { data: StundennachweisData }) {
  const datum = data.datumVon === data.datumBis ? data.datumVon : `${data.datumVon} – ${data.datumBis}`;
  return (
    <Document title={`Stundennachweis ${data.projekt} ${data.datumVon}`} author={VERLEIHER.name}>
      <Page size="A4" orientation="landscape" style={pdf.page}>
        <PdfHeader label="Einsatznummer" value={data.einsatznummer} />
        <Text style={pdf.title}>Stundennachweis</Text>
        <Text style={pdf.subtitle}>
          {data.projekt}
          {data.artist && data.artist !== data.projekt ? ` · ${data.artist}` : ""} · {datum}
        </Text>

        <Meta
          items={[
            { label: "Entleiher", value: `${data.entleiher.name}${data.entleiher.adresse ? `, ${data.entleiher.adresse}` : ""}` },
            { label: "Einsatzort", value: data.einsatzort },
            { label: "Projekt", value: data.projekt },
            { label: "Datum", value: datum },
            { label: "Einsatzbereich", value: data.einsatzbereich ?? "" },
            { label: "AÜ-Vertrag", value: data.aueVertragRef ?? "" },
          ]}
        />

        <Text style={pdf.sectionTitle}>Arbeitszeiten</Text>
        <Table
          columns={[
            { key: "nr", label: "Nr.", width: "3.5%" },
            { key: "name", label: "Name", width: "14%" },
            { key: "schicht", label: "Schicht / Datum", width: "11%" },
            { key: "start", label: "Start", width: "5.5%" },
            { key: "pause", label: "Pause", width: "5.5%" },
            { key: "ende", label: "Ende", width: "5.5%" },
            { key: "gesamt", label: "Gesamt", width: "6%", align: "right" },
            { key: "taetigkeit", label: "Tätigkeit", width: "10%" },
            { key: "pkw", label: "PKW", width: "6.5%" },
            { key: "spesen", label: "Spesen", width: "6%" },
            { key: "notiz", label: "Notiz", width: "12%" },
            { key: "signature", label: "Unterschrift", width: "14%" },
          ]}
          rows={data.zeilen.map((z) => ({
            nr: z.nr,
            name: z.name,
            schicht: `${z.schicht}\n${z.datum}`,
            start: z.start,
            pause: z.pause,
            ende: z.ende,
            gesamt: z.gesamt,
            taetigkeit: z.taetigkeit,
            pkw: z.pkw,
            spesen: z.spesen,
            notiz: z.notiz,
            signature: <SignatureCell row={z} />,
          }))}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
          <Text style={[pdf.text, { fontFamily: "Helvetica-Bold" }]}>Summe Stunden: {data.summeStunden}</Text>
        </View>

        {data.hinweise.length > 0 ? (
          <View style={{ marginTop: 6, padding: 6, borderWidth: 1, borderColor: ORANGE, borderRadius: 4 }}>
            {data.hinweise.map((h, i) => (
              <Text key={i} style={[pdf.small, { color: INK }]}>
                • {h}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={pdf.sectionTitle}>Fahrten</Text>
        {data.fahrten.length === 0 ? (
          <Text style={pdf.small}>Keine Fahrten erfasst.</Text>
        ) : (
          <Table
            columns={[
              { key: "person", label: "Person", width: "22%" },
              { key: "fahrzeugart", label: "Fahrzeugart", width: "14%" },
              { key: "strecken", label: "Strecken", width: "52%" },
              { key: "summe", label: "Summe km", width: "12%", align: "right" },
            ]}
            rows={data.fahrten.map((f) => ({
              person: f.person,
              fahrzeugart: f.fahrzeugart,
              strecken: f.strecken.map((s) => `${s.von} → ${s.nach} (${s.km} km)`).join("; "),
              summe: f.summe,
            }))}
          />
        )}

        <View style={{ flexDirection: "row", marginTop: 14, gap: 16 }} wrap={false}>
          <View style={{ width: "58%" }}>
            <Text style={pdf.sectionTitle}>Bestätigung der Mitarbeiter</Text>
            {CONFIRMATION_TEXT.map((t, i) => (
              <Text key={i} style={pdf.small}>
                ☑ {t}
              </Text>
            ))}
            <Text style={[pdf.small, { marginTop: 4 }]}>
              Die Unterschriften wurden digital auf dem Gerät des Mitarbeiters bzw. des Ansprechpartners vor Ort geleistet
              (Zeitstempel, Gerät und IP-Adresse sind protokolliert). Sicherheitsunterweisung Version {data.unterweisungVersion}.
            </Text>
          </View>
          <View style={{ width: "42%", borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 8, backgroundColor: SOFT }}>
            <Text style={pdf.sectionTitle}>Bestätigung des Kunden (Entleiher)</Text>
            {data.kunde ? (
              <View>
                <Text style={pdf.text}>{data.kunde.name}</Text>
                {data.kunde.signature ? <Image style={[pdf.signImage, { height: 40, width: 160 }]} src={{ data: data.kunde.signature, format: "png" }} /> : null}
                <Text style={pdf.small}>Unterschrieben am {data.kunde.zeitpunkt}</Text>
              </View>
            ) : (
              <View>
                <View style={pdf.signLine} />
                <Text style={pdf.signLabel}>Name, Datum, Unterschrift des Kunden</Text>
              </View>
            )}
            <Text style={[pdf.small, { marginTop: 4 }]}>
              Der Entleiher bestätigt die Richtigkeit der aufgeführten Arbeitszeiten.
            </Text>
          </View>
        </View>

        <PdfFooter left={`Erstellt am ${data.erstelltAm} · ${VERLEIHER.name}`} right={data.einsatznummer} />
      </Page>

      {/* Anlage: Sicherheitsunterweisung und PSA */}
      <Page size="A4" style={pdf.page}>
        <PdfHeader label="Anlage zum Stundennachweis" value={data.einsatznummer} />
        <Text style={pdf.title}>Sicherheitsunterweisung und PSA</Text>
        <Text style={pdf.subtitle}>Gilt für alle Einsätze der {VERLEIHER.name} · Bestätigung durch jeden Mitarbeiter vor Arbeitsbeginn</Text>
        <View style={{ flexDirection: "row", gap: 14, marginTop: 10 }}>
          {[SAFETY_SECTIONS.slice(0, Math.ceil(SAFETY_SECTIONS.length / 2)), SAFETY_SECTIONS.slice(Math.ceil(SAFETY_SECTIONS.length / 2))].map((col, ci) => (
            <View key={ci} style={{ width: "50%" }}>
              {col.map((s) => (
                <View key={s.titel} style={{ marginBottom: 8 }} wrap={false}>
                  <Text style={[pdf.sectionTitle, { marginTop: 4, marginBottom: 3 }]}>{s.titel}</Text>
                  {s.punkte.map((p, i) => (
                    <Text key={i} style={[pdf.small, { color: INK, marginBottom: 1.5 }]}>
                      • {p}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </View>
        <PdfFooter left={`Sicherheitsunterweisung Version ${SAFETY_VERSION} · Stand ${SAFETY_STAND}`} right={data.einsatznummer} />
      </Page>
    </Document>
  );
}

export async function renderStundennachweis(data: StundennachweisData): Promise<Buffer> {
  return renderToBuffer(<StundennachweisDocument data={data} />);
}
