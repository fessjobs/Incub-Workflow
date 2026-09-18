// Gemeinsames PDF-Layout für Konkretisierung und Stundennachweis.
// Serverseitig mit @react-pdf/renderer (reines JS, kein Chromium) – läuft auf
// Railway stabil und wird im Projekt bereits für das Beiblatt verwendet.
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import React from "react";
import { VERLEIHER } from "../safety";

export const ORANGE = VERLEIHER.farbe;
export const INK = "#1A1613";
export const MUTED = "#6B6560";
export const LINE = "#E6E1DC";
export const SOFT = "#FAF8F6";

export const pdf = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 54,
    paddingHorizontal: 40,
    fontSize: 9,
    color: INK,
    fontFamily: "Helvetica",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.5, borderBottomColor: ORANGE, paddingBottom: 8 },
  wordmark: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK, letterSpacing: -0.3 },
  wordmarkDot: { color: ORANGE },
  wordmarkSub: { fontSize: 7, color: MUTED, marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  eyebrow: { fontSize: 6.5, letterSpacing: 1.4, color: MUTED, textTransform: "uppercase" },
  headerValue: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 1 },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 18 },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 8, backgroundColor: SOFT },
  metaCell: { width: "33.33%", paddingVertical: 3, paddingRight: 8 },
  metaLabel: { fontSize: 6.5, color: MUTED, textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 8.5, marginTop: 1 },
  sectionTitle: { fontSize: 7, letterSpacing: 1.2, color: ORANGE, textTransform: "uppercase", marginTop: 12, marginBottom: 5, fontFamily: "Helvetica-Bold" },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, minHeight: 18, alignItems: "center" },
  trLast: { borderBottomWidth: 0 },
  th: { fontSize: 6.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8, paddingVertical: 4, paddingHorizontal: 4, fontFamily: "Helvetica-Bold" },
  td: { fontSize: 8, paddingVertical: 4, paddingHorizontal: 4 },
  thead: { backgroundColor: SOFT },
  text: { fontSize: 8.5, lineHeight: 1.4 },
  small: { fontSize: 7.5, color: MUTED, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 5, flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 6.5, color: MUTED },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 26 },
  signBox: { width: "45%" },
  signLine: { borderTopWidth: 1, borderTopColor: INK, marginBottom: 3, marginTop: 28 },
  signLabel: { fontSize: 7, color: MUTED },
  signImage: { height: 28, width: 90, objectFit: "contain", objectPosition: "left" },
});

export function PdfHeader({ label, value }: { label: string; value: string }) {
  return (
    <View style={pdf.header} fixed>
      <View>
        <Text style={pdf.wordmark}>
          fess<Text style={pdf.wordmarkDot}>.</Text>jobs
        </Text>
        <Text style={pdf.wordmarkSub}>{VERLEIHER.name} · Arbeitnehmerüberlassung</Text>
      </View>
      <View style={pdf.headerRight}>
        <Text style={pdf.eyebrow}>{label}</Text>
        <Text style={pdf.headerValue}>{value}</Text>
      </View>
    </View>
  );
}

export function PdfFooter({ left, right }: { left: string; right?: string }) {
  return (
    <View style={pdf.footer} fixed>
      <Text style={pdf.footerText}>{left}</Text>
      <Text style={pdf.footerText} render={({ pageNumber, totalPages }) => `${right ? `${right} · ` : ""}Seite ${pageNumber} von ${totalPages}`} />
    </View>
  );
}

export function Meta({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <View style={pdf.metaGrid}>
      {items.map((m) => (
        <View key={m.label} style={pdf.metaCell}>
          <Text style={pdf.metaLabel}>{m.label}</Text>
          <Text style={pdf.metaValue}>{m.value || "–"}</Text>
        </View>
      ))}
    </View>
  );
}

export type Column = { key: string; label: string; width: number | string; align?: "left" | "right" | "center" };

export function Table({ columns, rows }: { columns: Column[]; rows: Array<Record<string, React.ReactNode>> }) {
  return (
    <View style={pdf.table}>
      <View style={[pdf.tr, pdf.thead]}>
        {columns.map((c) => (
          <Text key={c.key} style={[pdf.th, { width: c.width, textAlign: c.align ?? "left" }]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={[pdf.tr, pdf.trLast]}>
          <Text style={[pdf.td, { width: "100%", color: MUTED }]}>Keine Einträge</Text>
        </View>
      ) : (
        rows.map((r, i) => (
          <View key={i} style={[pdf.tr, i === rows.length - 1 ? pdf.trLast : {}]} wrap={false}>
            {columns.map((c) => {
              const v = r[c.key];
              return typeof v === "string" || typeof v === "number" || v === null || v === undefined ? (
                <Text key={c.key} style={[pdf.td, { width: c.width, textAlign: c.align ?? "left" }]}>
                  {v === null || v === undefined || v === "" ? "–" : String(v)}
                </Text>
              ) : (
                <View key={c.key} style={[pdf.td, { width: c.width }]}>
                  {v}
                </View>
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}
