// Konkretisierung der Arbeitnehmerüberlassung (§ 1 Abs. 1 Satz 6 AÜG):
// vor Einsatzbeginn an den Entleiher – benennt die überlassenen Personen
// namentlich mit geplanter Zeit, Tätigkeit und Funktion.
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { VERLEIHER } from "../safety";
import { Meta, PdfFooter, PdfHeader, Table, pdf } from "./layout";

export type KonkretisierungRow = {
  nr: number;
  name: string;
  schicht: string;
  beginn: string;
  ende: string;
  taetigkeit: string;
  funktion: string;
};

export type KonkretisierungData = {
  einsatznummer: string;
  projekt: string;
  artist: string | null;
  entleiher: { name: string; adresse: string | null; ansprechpartner: string | null };
  einsatzort: string;
  datumVon: string; // DE-Format
  datumBis: string;
  einsatzbereich: string | null;
  aueVertragRef: string | null;
  erstelltAm: string;
  zeilen: KonkretisierungRow[];
};

function KonkretisierungDocument({ data }: { data: KonkretisierungData }) {
  const datum = data.datumVon === data.datumBis ? data.datumVon : `${data.datumVon} – ${data.datumBis}`;
  return (
    <Document title={`Konkretisierung ${data.projekt} ${data.datumVon}`} author={VERLEIHER.name}>
      <Page size="A4" style={pdf.page}>
        <PdfHeader label="Einsatznummer" value={data.einsatznummer} />
        <Text style={pdf.title}>Konkretisierung der Arbeitnehmerüberlassung</Text>
        <Text style={pdf.subtitle}>
          nach § 1 Abs. 1 Satz 6 AÜG · {data.projekt}
          {data.artist && data.artist !== data.projekt ? ` · ${data.artist}` : ""}
        </Text>

        <Meta
          items={[
            { label: "Entleiher", value: `${data.entleiher.name}${data.entleiher.adresse ? `, ${data.entleiher.adresse}` : ""}` },
            { label: "Einsatzort", value: data.einsatzort },
            { label: "Projekt", value: data.projekt },
            { label: "Datum", value: datum },
            { label: "Einsatznummer", value: data.einsatznummer },
            { label: "Einsatzbereich", value: data.einsatzbereich ?? "" },
            { label: "AÜ-Vertrag", value: data.aueVertragRef ?? "" },
            { label: "Verleiher", value: VERLEIHER.name },
            { label: "Ansprechpartner Entleiher", value: data.entleiher.ansprechpartner ?? "" },
          ]}
        />

        <Text style={pdf.sectionTitle}>Überlassene Leiharbeitnehmer</Text>
        <Table
          columns={[
            { key: "nr", label: "Nr.", width: "5%" },
            { key: "name", label: "Name", width: "25%" },
            { key: "schicht", label: "Schicht", width: "15%" },
            { key: "beginn", label: "Geplanter Beginn", width: "14%" },
            { key: "ende", label: "Geplantes Ende", width: "14%" },
            { key: "taetigkeit", label: "Tätigkeit", width: "15%" },
            { key: "funktion", label: "Funktion", width: "12%" },
          ]}
          rows={data.zeilen.map((z) => ({ ...z }))}
        />

        <View style={{ marginTop: 16 }}>
          <Text style={pdf.text}>
            Die vorstehend namentlich benannten Personen werden dem Entleiher im Rahmen des bestehenden
            Arbeitnehmerüberlassungsvertrags{data.aueVertragRef ? ` (${data.aueVertragRef})` : ""} für den genannten Einsatz
            überlassen. Diese Konkretisierung erfolgt vor Beginn der Überlassung gemäß § 1 Abs. 1 Satz 6 AÜG. Die Überlassung
            wird als Arbeitnehmerüberlassung bezeichnet (§ 1 Abs. 1 Satz 5 AÜG). Änderungen der eingesetzten Personen werden
            vor Einsatzbeginn in gleicher Form mitgeteilt.
          </Text>
          <Text style={[pdf.small, { marginTop: 6 }]}>
            Geplante Zeiten sind Planwerte; die tatsächlichen Arbeitszeiten werden im Stundennachweis dokumentiert und vom
            Entleiher bestätigt.
          </Text>
        </View>

        <View style={pdf.signRow}>
          <View style={pdf.signBox}>
            <View style={pdf.signLine} />
            <Text style={pdf.signLabel}>Ort, Datum · {VERLEIHER.name} (Verleiher)</Text>
          </View>
          <View style={pdf.signBox}>
            <View style={pdf.signLine} />
            <Text style={pdf.signLabel}>Zur Kenntnis genommen: {data.entleiher.name} (Entleiher)</Text>
          </View>
        </View>

        <PdfFooter left={`Erstellt am ${data.erstelltAm} · ${VERLEIHER.name}`} right={data.einsatznummer} />
      </Page>
    </Document>
  );
}

export async function renderKonkretisierung(data: KonkretisierungData): Promise<Buffer> {
  return renderToBuffer(<KonkretisierungDocument data={data} />);
}
