// Echtes (dekodierbares) PNG als Unterschrift für Tests: weißer Grund mit einer wellenförmigen Schreiblinie und Rauschen,
// damit die Datei nicht als „leere Fläche“ abgelehnt wird.
import { deflateSync } from "node:zlib";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(typ: string, daten: Buffer): Buffer {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const kern = Buffer.concat([Buffer.from(typ, "latin1"), daten]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(kern));
  return Buffer.concat([laenge, kern, crc]);
}

export function unterschriftPng(breite = 320, hoehe = 120): Buffer {
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(hoehe, 4);
  kopf[8] = 8; // 8 Bit
  kopf[9] = 0; // Graustufen
  const roh = Buffer.alloc((breite + 1) * hoehe, 255);
  let z = 12345;
  for (let y = 0; y < hoehe; y++) {
    roh[y * (breite + 1)] = 0; // Filter „keiner“
    for (let x = 0; x < breite; x++) {
      const linie = Math.round(hoehe / 2 + Math.sin(x / 11) * (hoehe / 4));
      z = (Math.imul(z, 1664525) + 1013904223) >>> 0;
      if (Math.abs(y - linie) < 3) roh[y * (breite + 1) + 1 + x] = 20 + (z % 60);
      else if (z % 7 === 0) roh[y * (breite + 1) + 1 + x] = 200 + (z % 55);
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", kopf), chunk("IDAT", deflateSync(roh)), chunk("IEND", Buffer.alloc(0))]);
}

export const unterschriftDataUrl = (breite?: number, hoehe?: number): string => `data:image/png;base64,${unterschriftPng(breite, hoehe).toString("base64")}`;
