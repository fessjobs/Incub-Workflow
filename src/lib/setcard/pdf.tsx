// A4-Setcard-PDF, serverseitig mit @react-pdf/renderer. Drei Layout-Varianten
// (banner / sidebar / light), Farben und Wortmarke kommen aus dem Firmen-Theme.
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";
import type { SetcardData, SetcardTheme } from "./themes";

const GRAY = "#6b7280";

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

const base = StyleSheet.create({
  page: { fontSize: 9.5, fontFamily: "Helvetica", color: "#1c1917" },
  eyebrow: { fontSize: 7.5, letterSpacing: 1.6, textTransform: "uppercase", fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 26, fontFamily: "Helvetica-Bold", marginTop: 4 },
  role: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 3 },
  badge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, fontSize: 8, fontFamily: "Helvetica-Bold", marginRight: 6 },
  tiles: { flexDirection: "row", gap: 6, marginTop: 12 },
  tile: { flex: 1, borderRadius: 8, padding: 8, borderWidth: 1 },
  tileLbl: { fontSize: 6.5, letterSpacing: 1.2, textTransform: "uppercase", color: GRAY, fontFamily: "Helvetica-Bold" },
  tileVal: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tileSub: { fontSize: 7.5, color: GRAY, marginTop: 1 },
  h2: { fontSize: 9, letterSpacing: 1.8, textTransform: "uppercase", fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 5 },
  txt: { fontSize: 9, lineHeight: 1.55, color: "#3f3f46" },
  callout: { borderLeftWidth: 3, padding: 7, marginTop: 8, borderRadius: 3 },
  cols: { flexDirection: "row", gap: 16, marginTop: 2 },
  job: { marginBottom: 7, paddingLeft: 8, borderLeftWidth: 2 },
  jobPeriod: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  jobTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 1 },
  jobCompany: { fontSize: 8, color: GRAY, marginTop: 1 },
  jobDetails: { fontSize: 8, color: "#52525b", marginTop: 2 },
  check: { fontSize: 8.5, marginBottom: 3.5 },
  chip: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3.5, fontSize: 8, fontFamily: "Helvetica-Bold", marginRight: 5, marginBottom: 5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  photoWrap: { position: "absolute", right: 0, top: 0, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  footContact: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  footSub: { fontSize: 7.5, marginTop: 3, opacity: 0.9 },
});

function Photo({ photo, theme, size, round }: { photo: string | null; theme: SetcardTheme; size: number; round: boolean }) {
  const style = {
    width: size,
    height: size,
    borderRadius: round ? size / 2 : 10,
    borderWidth: 3,
    borderColor: theme.layout === "sidebar" ? "#ffffff" : theme.primary,
    overflow: "hidden" as const,
    backgroundColor: theme.soft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  return (
    <View style={style}>
      {photo ? (
        <Image src={photo} style={{ width: size, height: size, objectFit: "cover" }} />
      ) : (
        <Text style={{ fontSize: size / 3.4, fontFamily: "Helvetica-Bold", color: theme.primaryDark }}>{""}</Text>
      )}
    </View>
  );
}

function Tiles({ data, theme }: { data: SetcardData; theme: SetcardTheme }) {
  return (
    <View style={base.tiles}>
      {data.tiles.map((t, i) => (
        <View key={i} style={[base.tile, { borderColor: theme.layout === "banner" ? theme.primary : "#e5e7eb", backgroundColor: theme.soft }]}>
          <Text style={base.tileLbl}>{t.label}</Text>
          <Text style={base.tileVal}>{t.value}</Text>
          {t.sub ? <Text style={base.tileSub}>{t.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function Body({ data, theme }: { data: SetcardData; theme: SetcardTheme }) {
  return (
    <>
      {data.profileText ? (
        <>
          <Text style={[base.h2, { color: theme.primaryDark }]}>Profil</Text>
          <Text style={base.txt}>{data.profileText}</Text>
        </>
      ) : null}
      {data.einsatzText ? (
        <View style={[base.callout, { borderLeftColor: theme.primary, backgroundColor: theme.soft }]}>
          <Text style={[base.eyebrow, { color: theme.primaryDark, fontSize: 7 }]}>Einsatzschwerpunkt</Text>
          <Text style={[base.txt, { marginTop: 2, fontSize: 8.5 }]}>{data.einsatzText}</Text>
        </View>
      ) : null}
      <View style={base.cols}>
        <View style={{ flex: 1.25 }}>
          {data.experiences.length > 0 ? (
            <>
              <Text style={[base.h2, { color: theme.primaryDark }]}>Berufserfahrung</Text>
              {data.experiences.slice(0, 5).map((e, i) => (
                <View key={i} style={[base.job, { borderLeftColor: theme.primary }]}>
                  <Text style={[base.jobPeriod, { color: theme.primaryDark }]}>{e.period}</Text>
                  <Text style={base.jobTitle}>{e.title}</Text>
                  <Text style={base.jobCompany}>{e.company}</Text>
                  {e.details ? <Text style={base.jobDetails}>{e.details}</Text> : null}
                </View>
              ))}
            </>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          {data.qualifications.length > 0 ? (
            <>
              <Text style={[base.h2, { color: theme.primaryDark }]}>Qualifikationen</Text>
              {data.qualifications.slice(0, 6).map((q, i) => (
                <Text key={i} style={base.check}>✓  {q}</Text>
              ))}
            </>
          ) : null}
          {data.strengths.length > 0 ? (
            <View style={{ backgroundColor: theme.soft, borderRadius: 8, padding: 9, marginTop: 10 }}>
              <Text style={[base.eyebrow, { color: theme.primaryDark, fontSize: 7 }]}>Stärken</Text>
              {data.strengths.slice(0, 4).map((s, i) => (
                <Text key={i} style={[base.check, { fontFamily: "Helvetica-Bold", marginTop: 3, marginBottom: 0 }]}>•  {s}</Text>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {data.skills.length > 0 ? (
        <>
          <Text style={[base.h2, { color: theme.primaryDark }]}>Skills</Text>
          <View style={base.chipRow}>
            {data.skills.slice(0, 8).map((s, i) => (
              <Text key={i} style={[base.chip, { backgroundColor: theme.primary, color: "#ffffff" }]}>{s}</Text>
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

function BannerLayout({ data, theme, photo }: { data: SetcardData; theme: SetcardTheme; photo: string | null }) {
  return (
    <Page size="A4" style={[base.page, { backgroundColor: theme.background }]}>
      {/* Farbband + Wortmarke */}
      <View style={{ backgroundColor: theme.primary, height: 86, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 22, fontFamily: "Helvetica-Bold", color: "#ffffff" }}>
          {theme.brandA}
          <Text style={{ color: theme.brandBColor ?? "#ffffff" }}>{theme.brandB}</Text>
        </Text>
      </View>
      {/* Weiße Karte */}
      <View style={{ marginTop: -22, marginHorizontal: 26, backgroundColor: "#ffffff", borderRadius: 14, padding: 22, flex: 1 }}>
        <View style={{ position: "relative", paddingRight: 100 }}>
          <Text style={[base.eyebrow, { color: theme.primary }]}>{theme.cardTitle}</Text>
          <Text style={base.h1}>{data.name}</Text>
          <Text style={[base.role, { color: theme.primary }]}>{data.role}</Text>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            <Text style={[base.badge, { backgroundColor: theme.soft, color: theme.primaryDark }]}>
              {`PROFIL-NR. ${data.profileNo}`}
            </Text>
            {data.badges.slice(0, 2).map((b, i) => (
              <Text key={i} style={[base.badge, { backgroundColor: theme.soft, color: theme.primaryDark }]}>
                {`${b.label.toUpperCase()}  ${b.value}`}
              </Text>
            ))}
          </View>
          <View style={base.photoWrap}>
            <Photo photo={photo} theme={theme} size={86} round />
          </View>
        </View>
        <Tiles data={data} theme={theme} />
        <Body data={data} theme={theme} />
      </View>
      {/* Footer */}
      <View style={{ marginHorizontal: 26, marginVertical: 16, backgroundColor: theme.footerBg, borderRadius: 10, padding: 12 }}>
        <Text style={[base.footContact, { color: theme.footerText }]}>{data.footerContact}</Text>
        <Text style={[base.footSub, { color: theme.footerText }]}>{data.footerSub}</Text>
      </View>
    </Page>
  );
}

function SidebarLayout({ data, theme, photo }: { data: SetcardData; theme: SetcardTheme; photo: string | null }) {
  return (
    <Page size="A4" style={base.page}>
      <View style={{ flexDirection: "row", flex: 1 }}>
        {/* Farbige Seitenleiste */}
        <View style={{ width: 175, backgroundColor: theme.primary, padding: 18 }}>
          <Text style={{ fontSize: 15, fontFamily: "Helvetica-Bold", color: "#ffffff" }}>
            {theme.brandA}
            <Text style={{ color: theme.brandBColor ?? "#ffffff" }}>{theme.brandB}</Text>
          </Text>
          <Text style={{ fontSize: 6.5, letterSpacing: 1.4, textTransform: "uppercase", color: theme.brandBColor ?? "#ffffff", marginTop: 2 }}>
            {theme.tagline}
          </Text>
          <View style={{ alignItems: "center", marginTop: 20, marginBottom: 8 }}>
            <Photo photo={photo} theme={theme} size={100} round />
          </View>
          <Text style={[base.eyebrow, { color: theme.brandBColor ?? "#ffffff", marginTop: 12, marginBottom: 4 }]}>Kontakt-Daten</Text>
          {data.tiles.map((t, i) => (
            <Text key={i} style={{ fontSize: 8.5, color: "#ffffff", marginBottom: 3 }}>{`${t.label}: ${t.value}${t.sub ? ` · ${t.sub}` : ""}`}</Text>
          ))}
          {data.qualifications.length > 0 ? (
            <>
              <Text style={[base.eyebrow, { color: theme.brandBColor ?? "#ffffff", marginTop: 12, marginBottom: 4 }]}>Qualifikationen</Text>
              {data.qualifications.slice(0, 6).map((q, i) => (
                <Text key={i} style={{ fontSize: 8.5, color: "#ffffff", marginBottom: 3 }}>✓  {q}</Text>
              ))}
            </>
          ) : null}
          {data.badges.length > 0 ? (
            <>
              <Text style={[base.eyebrow, { color: theme.brandBColor ?? "#ffffff", marginTop: 12, marginBottom: 4 }]}>Status</Text>
              {data.badges.map((b, i) => (
                <Text key={i} style={{ fontSize: 8.5, color: "#ffffff", marginBottom: 3 }}>{`${b.label}: ${b.value}`}</Text>
              ))}
            </>
          ) : null}
        </View>
        {/* Hauptteil */}
        <View style={{ flex: 1, padding: 24 }}>
          <Text style={[base.eyebrow, { color: theme.primary }]}>{theme.cardTitle}</Text>
          <Text style={base.h1}>{data.name}</Text>
          <Text style={[base.role, { color: theme.primary }]}>{data.role}</Text>
          <Text style={[base.eyebrow, { color: GRAY, marginTop: 4, fontSize: 6.5 }]}>{`Profil-Nr. ${data.profileNo}`}</Text>
          <Body data={data} theme={theme} />
          <View style={{ position: "absolute", bottom: 18, left: 24, right: 24, borderTopWidth: 2, borderTopColor: theme.primary, paddingTop: 8 }}>
            <Text style={[base.footContact, { color: theme.ink }]}>{data.footerContact}</Text>
            <Text style={[base.footSub, { color: GRAY }]}>{data.footerSub}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
}

function LightLayout({ data, theme, photo }: { data: SetcardData; theme: SetcardTheme; photo: string | null }) {
  const brandBColor = theme.key === "EC" ? theme.primary : theme.key === "IL" ? theme.primary : theme.ink;
  return (
    <Page size="A4" style={[base.page, { backgroundColor: theme.background }]}>
      {/* Kopf mit Wortmarke */}
      <View style={{ paddingHorizontal: 30, paddingTop: 24, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#ececec", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: theme.ink }}>
          {theme.brandA}
          <Text style={{ color: brandBColor }}>{theme.brandB}</Text>
        </Text>
        <Text style={{ fontSize: 8, letterSpacing: 1.6, color: GRAY }}>{`PROFIL-NR. ${data.profileNo}`}</Text>
      </View>
      <View style={{ paddingHorizontal: 30, paddingTop: 18, flex: 1 }}>
        <View style={{ position: "relative", paddingRight: 100 }}>
          <Text style={[base.eyebrow, { color: theme.key === "EQ" ? theme.primaryDark : theme.primary }]}>{theme.cardTitle}</Text>
          <Text style={base.h1}>{data.name}</Text>
          <Text style={[base.role, { color: theme.key === "EQ" ? theme.ink : theme.primaryDark }]}>{data.role}</Text>
          <View style={{ flexDirection: "row", marginTop: 8 }}>
            {data.badges.slice(0, 3).map((b, i) => (
              <Text key={i} style={[base.badge, { backgroundColor: theme.soft, color: theme.ink }]}>
                {`${b.label.toUpperCase()}  ${b.value}`}
              </Text>
            ))}
          </View>
          <View style={base.photoWrap}>
            <Photo photo={photo} theme={theme} size={86} round={theme.key !== "EQ"} />
          </View>
        </View>
        <Tiles data={data} theme={theme} />
        <Body data={data} theme={theme} />
      </View>
      {/* Footer */}
      <View style={{ backgroundColor: theme.footerBg, paddingHorizontal: 30, paddingVertical: 12 }}>
        <Text style={[base.footContact, { color: theme.footerText }]}>{data.footerContact}</Text>
        <Text style={[base.footSub, { color: theme.footerText }]}>{data.footerSub}</Text>
      </View>
    </Page>
  );
}

export async function renderSetcardPdf(
  data: SetcardData,
  theme: SetcardTheme,
  photoDataUrl: string | null
): Promise<Buffer> {
  const doc = (
    <Document title={`Setcard ${data.name}`} author={`${theme.brandA}${theme.brandB}`}>
      {theme.layout === "banner" ? (
        <BannerLayout data={data} theme={theme} photo={photoDataUrl} />
      ) : theme.layout === "sidebar" ? (
        <SidebarLayout data={data} theme={theme} photo={photoDataUrl} />
      ) : (
        <LightLayout data={data} theme={theme} photo={photoDataUrl} />
      )}
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
