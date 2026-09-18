// npm run zvoove:detect – leitet config/zvoove-mapping.json aus
// docs/zvoove-sample.csv ab (Trennzeichen, Zeichensatz, Datumsformat,
// Dezimaltrennzeichen, Spaltenreihenfolge) und zeigt das Ergebnis an.
import { existsSync, readFileSync, writeFileSync } from "fs";
import { CONFIG_PATH, SAMPLE_PATH, detectMappingFromSample } from "../src/lib/export/zvoove";

if (!existsSync(SAMPLE_PATH)) {
  console.error(`Keine Beispieldatei unter ${SAMPLE_PATH}. Bitte eine echte Export-/Importdatei aus zvoove dort ablegen.`);
  process.exit(1);
}
const mapping = detectMappingFromSample(readFileSync(SAMPLE_PATH));
writeFileSync(CONFIG_PATH, JSON.stringify(mapping, null, 2) + "\n");
console.log(`Mapping erkannt und nach ${CONFIG_PATH} geschrieben:`);
console.log(JSON.stringify(mapping, null, 2));
const unmapped = mapping.spalten.filter((s) => s.feld === "leer");
if (unmapped.length > 0) console.warn(`Nicht zugeordnete Spalten (bleiben leer): ${unmapped.map((s) => s.kopf).join(", ")} – bitte in der JSON manuell zuordnen.`);
