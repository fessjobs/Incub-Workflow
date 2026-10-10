// Nachweis über eine Unterweisung (mit Unterschrift der Person), A4. Wird beim Abschluss einmal erzeugt und
// unveränderlich gespeichert; Person und Administration laden dasselbe PDF.
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export interface NachweisDaten {
  person: string;
  pnr: string;
  modul: string;
  version: string;
  abgeschlossenAm: string; // TT.MM.JJJJ
  uhrzeit: string; // HH:MM, Berlin
  gueltigBis: string; // TT.MM.JJJJ
  quizProzent: number;
  video: "player" | "manuell" | "keins";
  hinweis: string;
  entwurf: boolean;
  unterschrift: Buffer;
}

const farbe = { tinte: "#0a1a2f", linie: "#d5dbe5", grau: "#5b6b82", orange: "#ff5a00" };
const st = StyleSheet.create({
  seite: { padding: 44, fontSize: 10.5, color: farbe.tinte, fontFamily: "Helvetica" },
  kopf: { borderBottomWidth: 2, borderBottomColor: farbe.orange, paddingBottom: 10, marginBottom: 18 },
  marke: { fontSize: 9, color: farbe.grau, letterSpacing: 1 },
  titel: { fontSize: 19, fontFamily: "Helvetica-Bold", marginTop: 4 },
  zeile: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: farbe.linie, paddingVertical: 6 },
  label: { width: 150, color: farbe.grau },
  wert: { flex: 1, fontFamily: "Helvetica-Bold" },
  absatz: { marginTop: 18, lineHeight: 1.45 },
  klein: { fontSize: 9, color: farbe.grau, lineHeight: 1.4 },
  entwurf: { marginTop: 14, padding: 8, borderWidth: 1, borderColor: farbe.orange, color: farbe.orange, fontSize: 9 },
  feld: { marginTop: 26, width: 300 },
  bild: { height: 90, objectFit: "contain", borderBottomWidth: 1, borderBottomColor: farbe.tinte },
  fuss: { position: "absolute", bottom: 28, left: 44, right: 44, fontSize: 8, color: farbe.grau, flexDirection: "row", justifyContent: "space-between" },
});

const VIDEO_TEXT: Record<NachweisDaten["video"], string> = {
  player: "vollständig angesehen",
  manuell: "angesehen (Wiedergabe im Gerät nicht möglich, von der Person bestätigt)",
  keins: "kein Video vorgesehen",
};

function Nachweis({ d }: { d: NachweisDaten }) {
  const zeilen: Array<[string, string]> = [
    ["Person", `${d.person} (Personalnummer ${d.pnr})`],
    ["Unterweisung", d.modul],
    ["Abgeschlossen am", `${d.abgeschlossenAm}, ${d.uhrzeit} Uhr`],
    ["Gültig bis", d.gueltigBis],
    ["Version der Inhalte", d.version],
    ["Quiz", `${d.quizProzent} % richtig`],
    ["Video", VIDEO_TEXT[d.video]],
  ];
  return (
    <Document title={`Nachweis Unterweisung – ${d.modul} – ${d.person}`} author="fess.jobs">
      <Page size="A4" style={st.seite}>
        <View style={st.kopf}>
          <Text style={st.marke}>FESS RECRUITMENT · FESS.JOBS</Text>
          <Text style={st.titel}>Nachweis über die Unterweisung</Text>
        </View>
        {zeilen.map(([l, w]) => (
          <View key={l} style={st.zeile}>
            <Text style={st.label}>{l}</Text>
            <Text style={st.wert}>{w}</Text>
          </View>
        ))}
        <Text style={st.absatz}>
          Ich habe die Unterweisung „{d.modul}“ durchgearbeitet (Lernkarten, Quiz{d.video === "keins" ? "" : ", Video"}), den Inhalt gelesen und verstanden und verpflichte mich, ihn einzuhalten.
        </Text>
        <View style={st.feld}>
          <Image src={d.unterschrift} style={st.bild} />
          <Text style={[st.klein, { marginTop: 4 }]}>
            {d.person} · {d.abgeschlossenAm}, {d.uhrzeit} Uhr
          </Text>
        </View>
        <Text style={[st.klein, { marginTop: 22 }]}>{d.hinweis}</Text>
        {d.entwurf ? <Text style={st.entwurf}>ENTWURF – die Inhalte der Unterweisung sind noch nicht von einer Fachkraft für Arbeitssicherheit freigegeben.</Text> : null}
        <View style={st.fuss} fixed>
          <Text>Erzeugt automatisch beim Abschluss der Unterweisung. Nicht nachträglich änderbar.</Text>
          <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderUnterweisungsNachweis(d: NachweisDaten): Promise<Buffer> {
  return renderToBuffer(<Nachweis d={d} />);
}
