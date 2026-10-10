// Unterschrift am Ende der Unterweisung: kommt als PNG-Data-URL vom Gerät und wird hier geprüft,
// bevor sie ins Nachweis-PDF kommt. Geprüft wird die Form (kein beliebiger Inhalt), nicht die Handschrift.
export interface GeprueftUnterschrift {
  bytes: Buffer;
  breite: number;
  hoehe: number;
}

export const MAX_UNTERSCHRIFT_BYTES = 300 * 1024;

export function pruefeUnterschrift(dataUrl: string): { ok: true; unterschrift: GeprueftUnterschrift } | { ok: false; fehler: string } {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!m) return { ok: false, fehler: "Die Unterschrift ist kein gültiges Bild." };
  if (m[1].length > Math.ceil((MAX_UNTERSCHRIFT_BYTES * 4) / 3) + 8) return { ok: false, fehler: "Die Unterschrift ist zu groß." };
  const bytes = Buffer.from(m[1], "base64");
  if (bytes.length > MAX_UNTERSCHRIFT_BYTES) return { ok: false, fehler: "Die Unterschrift ist zu groß." };
  // PNG-Kopf und IHDR: Signatur, dann Länge 13 und "IHDR", Breite und Höhe
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 40 || !sig.every((b, i) => bytes[i] === b) || bytes.toString("latin1", 12, 16) !== "IHDR") return { ok: false, fehler: "Die Unterschrift ist kein gültiges Bild." };
  const breite = bytes.readUInt32BE(16);
  const hoehe = bytes.readUInt32BE(20);
  if (breite < 100 || hoehe < 40 || breite > 2000 || hoehe > 1200) return { ok: false, fehler: "Die Unterschrift hat eine ungültige Größe." };
  // Ein leeres weißes Feld ist winzig; echte Striche machen die Datei größer
  if (bytes.length < 700) return { ok: false, fehler: "Bitte unterschreiben." };
  return { ok: true, unterschrift: { bytes, breite, hoehe } };
}
