// A4-Beiblatt (prüfungstaugliches Auslagen-/Belegdeckblatt, Spec Abschnitt 6).
// Serverseitig gerendert mit @react-pdf/renderer (reines JS, kein Browser nötig).
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import {
  formatEuro,
  formatDate,
  formatDateTime,
  KIND_LABELS,
  PAYMENT_LABELS,
  REIMBURSEMENT_LABELS,
} from "@/lib/format";
import type { VatLine } from "@/lib/claude";

const NAVY = "#0B1220";
const MUTED = "#6B7C9E";
const LINE = "#C6CFE0";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontSize: 10,
    color: NAVY,
    fontFamily: "Helvetica",
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: NAVY,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  logoText: { color: "#FFFFFF", fontSize: 13, fontFamily: "Helvetica-Bold" },
  companyName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  companyAddr: { fontSize: 9, color: MUTED, marginTop: 2, maxWidth: 240 },
  eyebrow: { fontSize: 7, letterSpacing: 1.5, color: MUTED, textTransform: "uppercase" },
  docNumber: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginTop: 24 },
  subtitle: { fontSize: 10, color: MUTED, marginTop: 2 },
  submitterRow: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  checkbox: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: NAVY,
    borderRadius: 2,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  sectionTitle: {
    fontSize: 8,
    letterSpacing: 1.2,
    color: MUTED,
    textTransform: "uppercase",
    marginTop: 22,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 4,
  },
  row: { flexDirection: "row", marginBottom: 6 },
  cellLabel: { width: 150, color: MUTED },
  cellValue: { flex: 1 },
  vatRow: { flexDirection: "row", marginBottom: 3 },
  vatCell: { width: 120 },
  banner: {
    marginTop: 16,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: "#F7F8FA",
  },
  bannerTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  footer: {
    position: "absolute",
    bottom: 40,
    left: 44,
    right: 44,
  },
  signRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  signBox: { width: "45%" },
  signLine: { borderTopWidth: 1, borderTopColor: NAVY, marginBottom: 3 },
  signLabel: { fontSize: 8, color: MUTED },
  footNote: { fontSize: 7.5, color: MUTED, textAlign: "center", borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
});

export type BeiblattData = {
  organizationBrand: string;
  company: {
    brandName: string;
    legalName: string | null;
    address: string | null;
    location: string | null;
    shortCode: string;
    color: string | null;
  };
  receiptNumber: string;
  submitterName: string;
  approved: boolean;
  receiptDate: Date;
  vendor: string;
  grossAmount: number;
  netAmount: number | null;
  vatLines: VatLine[];
  categoryName: string | null;
  kind: string;
  purpose: string | null;
  paymentMethod: string;
  reimbursementStatus: string;
  reimbursedAt: Date | null;
  isSelfReceipt: boolean;
  selfReceiptReason: string | null;
  hospitality: { guests: string | null; occasion: string | null; location: string | null } | null;
  vehicleName: string | null;
  odometerKm: number | null;
  notes: string | null;
  createdAt: Date;
};

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} .]/gu, "").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

function BeiblattDocument({ data }: { data: BeiblattData }) {
  const logoColor = data.company.color || NAVY;
  const reimburse =
    data.reimbursementStatus === "ERSTATTET" && data.reimbursedAt
      ? `Erstattet am ${formatDate(data.reimbursedAt)}`
      : REIMBURSEMENT_LABELS[data.reimbursementStatus] ?? data.reimbursementStatus;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Kopf */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row" }}>
            <View style={[styles.logoBox, { backgroundColor: logoColor }]}>
              <Text style={styles.logoText}>{initials(data.company.brandName)}</Text>
            </View>
            <View>
              <Text style={styles.companyName}>
                {data.company.legalName || data.company.brandName}
              </Text>
              <Text style={styles.companyAddr}>
                {data.company.address || "Anschrift im Onboarding ergänzen"}
                {data.company.location ? `  ·  ${data.company.location}` : ""}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.eyebrow}>Belegnummer</Text>
            <Text style={styles.docNumber}>{data.receiptNumber}</Text>
          </View>
        </View>

        <Text style={styles.title}>Belegbeiblatt / Auslagenabrechnung</Text>
        <Text style={styles.subtitle}>
          {data.company.brandName}
          {data.isSelfReceipt ? "  ·  Eigenbeleg" : ""}
        </Text>

        {/* Einreicher mit Prüf-/Freigabe-Kästchen */}
        <View style={styles.submitterRow}>
          <Text>Einreicher: {data.submitterName}</Text>
          <View style={styles.checkbox}>
            {data.approved ? <Text style={styles.checkboxMark}>X</Text> : null}
          </View>
          <Text style={{ marginLeft: 6, fontSize: 8, color: MUTED }}>geprüft / freigegeben</Text>
        </View>

        {/* Belegdaten */}
        <Text style={styles.sectionTitle}>Belegdaten</Text>
        <Field label="Belegdatum" value={formatDate(data.receiptDate)} />
        <Field label="Aussteller / Händler" value={data.vendor || "–"} />
        <Field label="Betrag brutto" value={formatEuro(data.grossAmount)} />

        <View style={styles.row}>
          <Text style={styles.cellLabel}>USt-Sätze</Text>
          <View style={styles.cellValue}>
            {data.vatLines.length === 0 ? (
              <Text>–</Text>
            ) : (
              data.vatLines.map((v, i) => (
                <View key={i} style={styles.vatRow}>
                  <Text style={styles.vatCell}>{v.rate} %</Text>
                  <Text style={styles.vatCell}>Netto {formatEuro(v.net)}</Text>
                  <Text style={styles.vatCell}>USt {formatEuro(v.vat)}</Text>
                </View>
              ))
            )}
          </View>
        </View>
        <Field label="Betrag netto" value={data.netAmount !== null ? formatEuro(data.netAmount) : "–"} />

        {/* Einordnung */}
        <Text style={styles.sectionTitle}>Einordnung</Text>
        <Field label="Kategorie" value={data.categoryName || "–"} />
        <Field label="Art" value={KIND_LABELS[data.kind] ?? data.kind} />
        <Field label="Geschäftlicher Anlass / Zweck" value={data.purpose || "–"} />
        <Field label="Zahlungsart" value={PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod} />
        <Field label="Erstattungsstatus" value={reimburse} />
        {data.vehicleName || data.odometerKm !== null ? (
          <>
            <Field label="Fahrzeug" value={data.vehicleName || "–"} />
            <Field
              label="Kilometerstand"
              value={data.odometerKm !== null ? `${data.odometerKm.toLocaleString("de-DE")} km` : "–"}
            />
          </>
        ) : null}

        {/* Sonderfall Bewirtung */}
        {data.hospitality ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Bewirtungsbeleg (§ 4 Abs. 5 Nr. 2 EStG)</Text>
            <Field label="Bewirtete Personen" value={data.hospitality.guests || "–"} />
            <Field label="Anlass der Bewirtung" value={data.hospitality.occasion || "–"} />
            <Field label="Ort" value={data.hospitality.location || "–"} />
          </View>
        ) : null}

        {/* Sonderfall Eigenbeleg */}
        {data.isSelfReceipt ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Eigenbeleg – kein Originalbeleg vorhanden</Text>
            <Field label="Begründung" value={data.selfReceiptReason || "–"} />
          </View>
        ) : null}

        {/* Freitext / Bemerkungen */}
        {data.notes ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Bemerkungen</Text>
            <Text>{data.notes}</Text>
          </View>
        ) : null}

        {/* Fuß */}
        <View style={styles.footer}>
          <View style={styles.signRow}>
            <View style={styles.signBox}>
              <View style={styles.signLine} />
              <Text style={styles.signLabel}>Unterschrift Einreicher</Text>
            </View>
            <View style={styles.signBox}>
              <View style={styles.signLine} />
              <Text style={styles.signLabel}>Unterschrift Freigabe</Text>
            </View>
          </View>
          <Text style={styles.footNote}>
            Erstellt am {formatDateTime(data.createdAt)} über {data.organizationBrand} · Beleg {data.receiptNumber}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderBeiblatt(data: BeiblattData): Promise<Buffer> {
  return renderToBuffer(<BeiblattDocument data={data} />);
}
