"use client";

// HTML-Live-Vorschau der Setcard – spiegelt die PDF-Layouts (banner/sidebar/
// light) im A4-Verhältnis, Farben aus dem Firmen-Theme.
import type { SetcardData, SetcardTheme } from "@/lib/setcard/themes";

const GRAY = "#6b7280";

export function SetcardPreview({
  data,
  theme,
  photo,
}: {
  data: SetcardData;
  theme: SetcardTheme;
  photo: string | null;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[560px] overflow-hidden rounded-xl shadow-lg ring-1 ring-black/10"
      style={{ aspectRatio: "210/297", background: theme.background, color: theme.ink, fontSize: 10, lineHeight: 1.35 }}
    >
      {theme.layout === "banner" && <Banner data={data} theme={theme} photo={photo} />}
      {theme.layout === "sidebar" && <Sidebar data={data} theme={theme} photo={photo} />}
      {theme.layout === "light" && <Light data={data} theme={theme} photo={photo} />}
    </div>
  );
}

function Photo({ photo, theme, size, round }: { photo: string | null; theme: SetcardTheme; size: number; round: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: round ? "50%" : 10,
        border: `3px solid ${theme.layout === "sidebar" ? "#fff" : theme.primary}`,
        background: theme.soft,
        overflow: "hidden",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Foto" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{ color: theme.primaryDark, fontWeight: 800, fontSize: size / 3.2 }}>
          {data0(theme)}
        </span>
      )}
    </div>
  );
}
function data0(_t: SetcardTheme) {
  return "📷";
}

function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <p style={{ fontSize: 7.5, letterSpacing: 1.6, textTransform: "uppercase", fontWeight: 800, color }}>{children}</p>
  );
}

function Badges({ data, theme }: { data: SetcardData; theme: SetcardTheme }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
      <span style={{ background: theme.soft, color: theme.primaryDark, borderRadius: 9, padding: "3px 8px", fontSize: 7.5, fontWeight: 800 }}>
        PROFIL-NR. {data.profileNo}
      </span>
      {data.badges.slice(0, 2).map((b, i) => (
        <span key={i} style={{ background: theme.soft, color: theme.primaryDark, borderRadius: 9, padding: "3px 8px", fontSize: 7.5, fontWeight: 800 }}>
          {b.label.toUpperCase()} {b.value}
        </span>
      ))}
    </div>
  );
}

function Tiles({ data, theme }: { data: SetcardData; theme: SetcardTheme }) {
  return (
    <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
      {data.tiles.map((t, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 8, padding: 7, border: `1px solid ${theme.layout === "banner" ? theme.primary : "#e5e7eb"}`, background: theme.soft }}>
          <p style={{ fontSize: 6, letterSpacing: 1, textTransform: "uppercase", color: GRAY, fontWeight: 800 }}>{t.label}</p>
          <p style={{ fontSize: 8.5, fontWeight: 800, marginTop: 1 }}>{t.value}</p>
          {t.sub && <p style={{ fontSize: 7, color: GRAY }}>{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function Body({ data, theme }: { data: SetcardData; theme: SetcardTheme }) {
  return (
    <>
      {data.profileText && (
        <>
          <p style={h2(theme)}>Profil</p>
          <p style={{ fontSize: 8, color: "#3f3f46" }}>{data.profileText}</p>
        </>
      )}
      {data.einsatzText && (
        <div style={{ borderLeft: `3px solid ${theme.primary}`, background: theme.soft, padding: "5px 8px", marginTop: 7, borderRadius: 3 }}>
          <p style={{ fontSize: 6.5, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 800, color: theme.primaryDark }}>Einsatzschwerpunkt</p>
          <p style={{ fontSize: 7.5, color: "#3f3f46", marginTop: 1 }}>{data.einsatzText}</p>
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
        <div style={{ flex: 1.25 }}>
          {data.experiences.length > 0 && (
            <>
              <p style={h2(theme)}>Berufserfahrung</p>
              {data.experiences.slice(0, 4).map((e, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${theme.primary}`, paddingLeft: 6, marginBottom: 5 }}>
                  <p style={{ fontSize: 6.5, fontWeight: 800, color: theme.primaryDark }}>{e.period}</p>
                  <p style={{ fontSize: 8, fontWeight: 800 }}>{e.title}</p>
                  <p style={{ fontSize: 7, color: GRAY }}>{e.company}</p>
                  {e.details && <p style={{ fontSize: 7, color: "#52525b" }}>{e.details}</p>}
                </div>
              ))}
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {data.qualifications.length > 0 && (
            <>
              <p style={h2(theme)}>Qualifikationen</p>
              {data.qualifications.slice(0, 6).map((q, i) => (
                <p key={i} style={{ fontSize: 7.5, marginBottom: 2.5 }}>✓ {q}</p>
              ))}
            </>
          )}
          {data.strengths.length > 0 && (
            <div style={{ background: theme.soft, borderRadius: 8, padding: 7, marginTop: 7 }}>
              <p style={{ fontSize: 6.5, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 800, color: theme.primaryDark }}>Stärken</p>
              {data.strengths.slice(0, 4).map((s, i) => (
                <p key={i} style={{ fontSize: 7.5, fontWeight: 700, marginTop: 2 }}>• {s}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      {data.skills.length > 0 && (
        <>
          <p style={h2(theme)}>Skills</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {data.skills.slice(0, 8).map((s, i) => (
              <span key={i} style={{ background: theme.primary, color: "#fff", borderRadius: 9, padding: "2.5px 8px", fontSize: 7, fontWeight: 800 }}>
                {s}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function h2(theme: SetcardTheme): React.CSSProperties {
  return {
    fontSize: 7.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: 800,
    color: theme.primaryDark,
    margin: "10px 0 4px",
  };
}

function Wordmark({ theme, color }: { theme: SetcardTheme; color: string }) {
  const bColor =
    theme.layout === "banner" || theme.layout === "sidebar"
      ? theme.brandBColor ?? "#fff"
      : theme.key === "EC" || theme.key === "IL"
        ? theme.primary
        : theme.ink;
  return (
    <span style={{ fontWeight: 800, color }}>
      {theme.brandA}
      <span style={{ color: bColor, fontWeight: theme.key === "IL" ? 300 : 800 }}>{theme.brandB}</span>
    </span>
  );
}

function Banner({ data, theme, photo }: { data: SetcardData; theme: SetcardTheme; photo: string | null }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ background: theme.primary, height: 62, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>
        <Wordmark theme={theme} color="#fff" />
      </div>
      <div style={{ margin: "-16px 18px 0", background: "#fff", borderRadius: 12, padding: 16, flex: 1, boxShadow: "0 4px 16px rgba(0,0,0,.08)", overflow: "hidden" }}>
        <div style={{ position: "relative", paddingRight: 80 }}>
          <Eyebrow color={theme.primary}>{theme.cardTitle}</Eyebrow>
          <p style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{data.name}</p>
          <p style={{ fontSize: 9.5, fontWeight: 800, color: theme.primary, marginTop: 1 }}>{data.role}</p>
          <Badges data={data} theme={theme} />
          <div style={{ position: "absolute", right: 0, top: 0 }}>
            <Photo photo={photo} theme={theme} size={64} round />
          </div>
        </div>
        <Tiles data={data} theme={theme} />
        <Body data={data} theme={theme} />
      </div>
      <div style={{ margin: "10px 18px 14px", background: theme.footerBg, color: theme.footerText, borderRadius: 9, padding: "8px 12px" }}>
        <p style={{ fontSize: 8, fontWeight: 800 }}>{data.footerContact}</p>
        <p style={{ fontSize: 6.5, marginTop: 2, opacity: 0.9 }}>{data.footerSub}</p>
      </div>
    </div>
  );
}

function Sidebar({ data, theme, photo }: { data: SetcardData; theme: SetcardTheme; photo: string | null }) {
  const accent = theme.brandBColor ?? "#fff";
  return (
    <div style={{ height: "100%", display: "flex" }}>
      <div style={{ width: "32%", background: `linear-gradient(170deg, ${theme.primary}, ${theme.primaryDark})`, color: "#fff", padding: 12 }}>
        <p style={{ fontSize: 12 }}>
          <Wordmark theme={theme} color="#fff" />
        </p>
        <p style={{ fontSize: 5.5, letterSpacing: 1, textTransform: "uppercase", color: accent, marginTop: 2 }}>{theme.tagline}</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "14px 0 8px" }}>
          <Photo photo={photo} theme={theme} size={72} round />
        </div>
        <p style={{ fontSize: 6, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 800, color: accent, margin: "8px 0 3px" }}>Kontakt-Daten</p>
        {data.tiles.map((t, i) => (
          <p key={i} style={{ fontSize: 7, marginBottom: 2 }}>{t.label}: {t.value}{t.sub ? ` · ${t.sub}` : ""}</p>
        ))}
        {data.qualifications.length > 0 && (
          <>
            <p style={{ fontSize: 6, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 800, color: accent, margin: "8px 0 3px" }}>Qualifikationen</p>
            {data.qualifications.slice(0, 6).map((q, i) => (
              <p key={i} style={{ fontSize: 7, marginBottom: 2 }}>✓ {q}</p>
            ))}
          </>
        )}
        {data.badges.length > 0 && (
          <>
            <p style={{ fontSize: 6, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 800, color: accent, margin: "8px 0 3px" }}>Status</p>
            {data.badges.map((b, i) => (
              <p key={i} style={{ fontSize: 7, marginBottom: 2 }}>{b.label}: {b.value}</p>
            ))}
          </>
        )}
      </div>
      <div style={{ flex: 1, padding: 14, position: "relative", display: "flex", flexDirection: "column" }}>
        <Eyebrow color={theme.primary}>{theme.cardTitle}</Eyebrow>
        <p style={{ fontSize: 19, fontWeight: 800, marginTop: 2 }}>{data.name}</p>
        <p style={{ fontSize: 9.5, fontWeight: 800, color: theme.primary }}>{data.role}</p>
        <p style={{ fontSize: 6.5, letterSpacing: 1, color: GRAY, marginTop: 2 }}>PROFIL-NR. {data.profileNo}</p>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <Body data={data} theme={theme} />
        </div>
        <div style={{ borderTop: `2px solid ${theme.primary}`, paddingTop: 5, marginTop: 6 }}>
          <p style={{ fontSize: 8, fontWeight: 800 }}>{data.footerContact}</p>
          <p style={{ fontSize: 6.5, color: GRAY, marginTop: 1 }}>{data.footerSub}</p>
        </div>
      </div>
    </div>
  );
}

function Light({ data, theme, photo }: { data: SetcardData; theme: SetcardTheme; photo: string | null }) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 18px 8px", borderBottom: "1px solid #ececec", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
        <Wordmark theme={theme} color={theme.ink} />
        <span style={{ fontSize: 6.5, letterSpacing: 1.2, color: GRAY }}>PROFIL-NR. {data.profileNo}</span>
      </div>
      <div style={{ padding: "12px 18px", flex: 1, overflow: "hidden" }}>
        <div style={{ position: "relative", paddingRight: 80 }}>
          <Eyebrow color={theme.key === "EQ" ? theme.primaryDark : theme.primary}>{theme.cardTitle}</Eyebrow>
          <p style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{data.name}</p>
          <p style={{ fontSize: 9.5, fontWeight: 800, color: theme.key === "EQ" ? theme.ink : theme.primaryDark, marginTop: 1 }}>{data.role}</p>
          <Badges data={data} theme={theme} />
          <div style={{ position: "absolute", right: 0, top: 0 }}>
            <Photo photo={photo} theme={theme} size={64} round={theme.key !== "EQ"} />
          </div>
        </div>
        <Tiles data={data} theme={theme} />
        <Body data={data} theme={theme} />
      </div>
      <div style={{ background: theme.footerBg, color: theme.footerText, padding: "8px 18px" }}>
        <p style={{ fontSize: 8, fontWeight: 800 }}>{data.footerContact}</p>
        <p style={{ fontSize: 6.5, marginTop: 2, opacity: 0.9 }}>{data.footerSub}</p>
      </div>
    </div>
  );
}
