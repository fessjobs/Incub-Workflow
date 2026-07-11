import { PDFDocument } from "pdf-lib";

// Fügt Beiblatt (Seite 1) + Belegbild/PDF (ab Seite 2) zu einer PDF zusammen
// (Spec Abschnitt 5.5). Das Original bleibt zusätzlich unverändert gespeichert.
export async function mergeBeiblattWithReceipt(
  beiblattPdf: Buffer,
  original: { bytes: Buffer; mimeType: string } | null
): Promise<Buffer> {
  const out = await PDFDocument.load(beiblattPdf);

  if (original) {
    try {
      if (original.mimeType === "application/pdf") {
        const src = await PDFDocument.load(original.bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else if (original.mimeType === "image/jpeg" || original.mimeType === "image/png") {
        const img =
          original.mimeType === "image/jpeg"
            ? await out.embedJpg(original.bytes)
            : await out.embedPng(original.bytes);
        // A4-Seite, Bild eingepasst mit Rand
        const page = out.addPage([595.28, 841.89]);
        const margin = 32;
        const maxW = page.getWidth() - margin * 2;
        const maxH = page.getHeight() - margin * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, {
          x: (page.getWidth() - w) / 2,
          y: (page.getHeight() - h) / 2,
          width: w,
          height: h,
        });
      }
      // andere Bildtypen (webp/gif/heic): nur Beiblatt, Original bleibt separat gespeichert
    } catch (err) {
      console.error("Beleg konnte nicht in die PDF eingebettet werden:", err);
    }
  }

  const bytes = await out.save();
  return Buffer.from(bytes);
}
