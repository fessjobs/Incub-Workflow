// Monatsstundenzettel einer Person für einen Kunden: alle Tage des Monats mit Zeiten, Fahrten, Absprachen und
// freiwilliger Beschreibung, Unterschrift der Person und Bestätigung des Kunden.
import { Document, Image, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { VERLEIHER } from "../safety";
import { INK, LINE, MUTED, Meta, ORANGE, PdfFooter, PdfHeader, SOFT, Table, pdf } from "./layout";

export type MonatsPdfZeile = {
  datum: string;
  zeit: string;
  pause: string;
  stunden: string;
  taetigkeit: string;
  fahrten: string;
  spesen: string;
  bemerkung: string;
};

export type MonatsPdfData = {
  einsatznummer: string;
  monatLabel: string;
  person: string;
  personalnummer: string | null;
  kunde: { name: string; adresse: string | null };
  zeilen: MonatsPdfZeile[];
  summe: { stunden: string; tage: number; km: string; spesen: string };
  erstelltAm: string;
  person_unterschrift: { bytes: Buffer | null; zeitpunkt: string | null };
  // null = der Kunde hat (noch) nicht bestätigt – das PDF ist dann eine Vorschau
  kunde_unterschrift: { name: string; bytes: Buffer | null; zeitpunkt: string } | null;
};

function MonatsDocument({ data }: { data: MonatsPdfData }) {
  return (
    <Document title={`Monatsstundenzettel ${data.monatLabel} ${data.person}`} author={VERLEIHER.name}>
      <Page size="A4" orientation="landscape" style={pdf.page}>
        <PdfHeader label="Einsatznummer" value={data.einsatznummer} />
        <Text style={pdf.title}>Monatsstundenzettel</Text>
        <Text style={pdf.subtitle}>
          {data.monatLabel} · {data.person}
          {data.kunde_unterschrift ? "" : " · VORSCHAU – noch nicht vom Kunden bestätigt"}
        </Text>

        <Meta
          items={[
            { label: "Mitarbeiter", value: `${data.person}${data.personalnummer ? ` (${data.personalnummer})` : ""}` },
            { label: "Kunde (Entleiher)", value: `${data.kunde.name}${data.kunde.adresse ? `, ${data.kunde.adresse}` : ""}` },
            { label: "Monat", value: data.monatLabel },
            { label: "Tage", value: String(data.summe.tage) },
            { label: "Stunden gesamt", value: data.summe.stunden },
            { label: "Fahrt (km) / Spesen", value: `${data.summe.km} km · ${data.summe.spesen}` },
          ]}
        />

        <Text style={pdf.sectionTitle}>Arbeitstage</Text>
        <Table
          columns={[
            { key: "datum", label: "Datum", width: "12%" },
            { key: "zeit", label: "Zeit", width: "10%" },
            { key: "pause", label: "Pause", width: "6.5%" },
            { key: "stunden", label: "Stunden", width: "7%", align: "right" },
            { key: "taetigkeit", label: "Tätigkeit", width: "12%" },
            { key: "fahrten", label: "Fahrten", width: "18%" },
            { key: "spesen", label: "Spesen", width: "7%" },
            { key: "bemerkung", label: "Absprache / Beschreibung / Notiz", width: "27.5%" },
          ]}
          rows={data.zeilen.map((z) => ({ ...z }))}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
          <Text style={[pdf.text, { fontFamily: "Helvetica-Bold" }]}>Summe Stunden: {data.summe.stunden}</Text>
        </View>

        <View style={{ flexDirection: "row", marginTop: 14, gap: 16 }} wrap={false}>
          <View style={{ width: "50%", borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 8 }}>
            <Text style={pdf.sectionTitle}>Bestätigung des Mitarbeiters</Text>
            {data.person_unterschrift.bytes ? <Image style={[pdf.signImage, { height: 36, width: 150 }]} src={{ data: data.person_unterschrift.bytes, format: "png" }} /> : <View style={pdf.signLine} />}
            <Text style={pdf.small}>
              {data.person}
              {data.person_unterschrift.zeitpunkt ? ` · unterschrieben am ${data.person_unterschrift.zeitpunkt}` : ""}
            </Text>
            <Text style={[pdf.small, { marginTop: 2 }]}>Ich bestätige, dass die Angaben richtig und vollständig sind.</Text>
          </View>
          <View style={{ width: "50%", borderWidth: 1, borderColor: data.kunde_unterschrift ? LINE : ORANGE, borderRadius: 6, padding: 8, backgroundColor: SOFT }}>
            <Text style={pdf.sectionTitle}>Bestätigung des Kunden (Entleiher)</Text>
            {data.kunde_unterschrift ? (
              <View>
                {data.kunde_unterschrift.bytes ? <Image style={[pdf.signImage, { height: 36, width: 150 }]} src={{ data: data.kunde_unterschrift.bytes, format: "png" }} /> : null}
                <Text style={pdf.small}>
                  {data.kunde_unterschrift.name} · unterschrieben am {data.kunde_unterschrift.zeitpunkt}
                </Text>
              </View>
            ) : (
              <View>
                <View style={pdf.signLine} />
                <Text style={pdf.signLabel}>Name, Datum, Unterschrift des Kunden</Text>
              </View>
            )}
            <Text style={[pdf.small, { marginTop: 2, color: INK }]}>Der Entleiher bestätigt die Richtigkeit der aufgeführten Arbeitszeiten.</Text>
          </View>
        </View>
        <Text style={[pdf.small, { marginTop: 6, color: MUTED }]}>Die Unterschriften wurden digital auf dem Gerät geleistet (Zeitpunkt, Gerät und IP-Adresse sind protokolliert).</Text>

        <PdfFooter left={`Erstellt am ${data.erstelltAm} · ${VERLEIHER.name}`} right={data.einsatznummer} />
      </Page>
    </Document>
  );
}

export async function renderMonatsstundenzettel(data: MonatsPdfData): Promise<Buffer> {
  return renderToBuffer(<MonatsDocument data={data} />);
}
