// Bundesland aus dem Einsatzort ableiten (für den Feiertagskalender).
// Reihenfolge: explizites Kürzel im Text → Postleitzahl → Stadtname.
// Fallback ist BW (Sitz der FESS recruitment GmbH & Co. KG in Göppingen).

export const DEFAULT_BUNDESLAND = "BW";

// Grobe PLZ-Leitzonen → Bundesland (zweistellige Präfixe). Grenzfälle sind
// bewusst auf das überwiegende Land gemappt.
const PLZ_PREFIX: Array<[string, string]> = [
  ["01", "SN"], ["02", "SN"], ["03", "BB"], ["04", "SN"], ["06", "ST"], ["07", "TH"],
  ["08", "SN"], ["09", "SN"], ["10", "BE"], ["11", "BE"], ["12", "BE"], ["13", "BE"],
  ["14", "BB"], ["15", "BB"], ["16", "BB"], ["17", "MV"], ["18", "MV"], ["19", "MV"],
  ["20", "HH"], ["21", "HH"], ["22", "HH"], ["23", "SH"], ["24", "SH"], ["25", "SH"],
  ["26", "NI"], ["27", "NI"], ["28", "HB"], ["29", "NI"], ["30", "NI"], ["31", "NI"],
  ["32", "NW"], ["33", "NW"], ["34", "HE"], ["35", "HE"], ["36", "HE"], ["37", "NI"],
  ["38", "NI"], ["39", "ST"], ["40", "NW"], ["41", "NW"], ["42", "NW"], ["44", "NW"],
  ["45", "NW"], ["46", "NW"], ["47", "NW"], ["48", "NW"], ["49", "NI"], ["50", "NW"],
  ["51", "NW"], ["52", "NW"], ["53", "NW"], ["54", "RP"], ["55", "RP"], ["56", "RP"],
  ["57", "NW"], ["58", "NW"], ["59", "NW"], ["60", "HE"], ["61", "HE"], ["63", "HE"],
  ["64", "HE"], ["65", "HE"], ["66", "SL"], ["67", "RP"], ["68", "BW"], ["69", "BW"],
  ["70", "BW"], ["71", "BW"], ["72", "BW"], ["73", "BW"], ["74", "BW"], ["75", "BW"],
  ["76", "BW"], ["77", "BW"], ["78", "BW"], ["79", "BW"], ["80", "BY"], ["81", "BY"],
  ["82", "BY"], ["83", "BY"], ["84", "BY"], ["85", "BY"], ["86", "BY"], ["87", "BY"],
  ["88", "BW"], ["89", "BW"], ["90", "BY"], ["91", "BY"], ["92", "BY"], ["93", "BY"],
  ["94", "BY"], ["95", "BY"], ["96", "BY"], ["97", "BY"], ["98", "TH"], ["99", "TH"],
];

const CITY: Array<[RegExp, string]> = [
  [/stuttgart|mannheim|karlsruhe|heilbronn|göppingen|goeppingen|ulm|freiburg|heidelberg|pforzheim|reutlingen|esslingen|ludwigsburg|sindelfingen|schwäbisch|friedrichshafen|konstanz/i, "BW"],
  [/münchen|muenchen|nürnberg|nuernberg|augsburg|regensburg|würzburg|wuerzburg|ingolstadt|fürth|erlangen|bamberg|passau|rosenheim/i, "BY"],
  [/\bberlin\b/i, "BE"],
  [/potsdam|cottbus|brandenburg/i, "BB"],
  [/bremen|bremerhaven/i, "HB"],
  [/hamburg/i, "HH"],
  [/frankfurt|wiesbaden|kassel|darmstadt|offenbach|gießen|giessen|fulda|hanau/i, "HE"],
  [/rostock|schwerin|stralsund|greifswald/i, "MV"],
  [/hannover|braunschweig|oldenburg|osnabrück|osnabrueck|wolfsburg|göttingen|goettingen|hildesheim|lüneburg|luhden/i, "NI"],
  [/köln|koeln|düsseldorf|duesseldorf|dortmund|essen|duisburg|bochum|wuppertal|bielefeld|bonn|münster|muenster|gelsenkirchen|mönchengladbach|moenchengladbach|aachen|krefeld|oberhausen|leverkusen/i, "NW"],
  [/mainz|ludwigshafen|koblenz|trier|kaiserslautern|idar-oberstein|worms|speyer/i, "RP"],
  [/saarbrücken|saarbruecken|saarland|neunkirchen/i, "SL"],
  [/leipzig|dresden|chemnitz|zwickau/i, "SN"],
  [/magdeburg|halle/i, "ST"],
  [/kiel|lübeck|luebeck|flensburg/i, "SH"],
  [/erfurt|jena|gera|weimar/i, "TH"],
];

export function deriveBundesland(einsatzort: string | null | undefined): string | null {
  if (!einsatzort) return null;
  const text = einsatzort.trim();
  const explicit = text.match(/\b(BW|BY|BE|BB|HB|HH|HE|MV|NI|NW|RP|SL|SN|ST|SH|TH)\b/);
  if (explicit) return explicit[1];
  const plz = text.match(/\b(\d{5})\b/);
  if (plz) {
    const hit = PLZ_PREFIX.find(([prefix]) => plz[1].startsWith(prefix));
    if (hit) return hit[1];
  }
  for (const [re, bl] of CITY) if (re.test(text)) return bl;
  return null;
}

export function resolveBundesland(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    if (c && c.trim()) return c.trim().toUpperCase();
  }
  return DEFAULT_BUNDESLAND;
}
