// Namens-Matching gegen den Mitarbeiterstamm: exakt → normalisiert (ohne
// Diakritika, Reihenfolge Vor-/Nachname egal) → Fuzzy per pg_trgm.
// Nur exakte und normalisierte Treffer gelten als sicher; Fuzzy-Treffer
// werden im UI zur Bestätigung angezeigt und nie automatisch übernommen.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeName } from "./parser";

export type MatchMethod = "exakt" | "normalisiert" | "fuzzy";

export type MatchCandidate = {
  employeeId: string;
  name: string;
  personalnummer: string | null;
  score: number;
  method: MatchMethod;
};

export type NameMatch = {
  input: string;
  best: MatchCandidate | null;
  candidates: MatchCandidate[];
  sicher: boolean;
};

type EmployeeRow = { id: string; vorname: string; nachname: string; personalnummer: string | null };

function fullName(e: EmployeeRow): string {
  return `${e.vorname} ${e.nachname}`.trim();
}

function sortedTokens(name: string): string {
  return normalizeName(name).split(" ").sort().join(" ");
}

export async function matchNames(organizationId: string, names: string[], options?: { fuzzyThreshold?: number; maxCandidates?: number }): Promise<NameMatch[]> {
  const threshold = options?.fuzzyThreshold ?? 0.35;
  const maxCandidates = options?.maxCandidates ?? 3;
  const employees: EmployeeRow[] = await db.employee.findMany({
    where: { organizationId, status: "AKTIV" },
    select: { id: true, vorname: true, nachname: true, personalnummer: true },
  });
  const byExact = new Map<string, EmployeeRow>();
  const byNormalized = new Map<string, EmployeeRow[]>();
  for (const e of employees) {
    byExact.set(fullName(e).toLowerCase(), e);
    const key = sortedTokens(fullName(e));
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), e]);
  }

  const results: NameMatch[] = [];
  const unmatched: string[] = [];
  for (const input of names) {
    const trimmed = input.trim();
    const exact = byExact.get(trimmed.toLowerCase());
    if (exact) {
      const c = candidate(exact, 1, "exakt");
      results.push({ input, best: c, candidates: [c], sicher: true });
      continue;
    }
    const normalized = byNormalized.get(sortedTokens(trimmed)) ?? [];
    if (normalized.length === 1) {
      const c = candidate(normalized[0], 0.98, "normalisiert");
      results.push({ input, best: c, candidates: [c], sicher: true });
      continue;
    }
    if (normalized.length > 1) {
      // Mehrere Personen mit gleichem normalisierten Namen → unsicher
      const cs = normalized.map((e) => candidate(e, 0.9, "normalisiert"));
      results.push({ input, best: cs[0], candidates: cs, sicher: false });
      continue;
    }
    results.push({ input, best: null, candidates: [], sicher: false });
    unmatched.push(input);
  }

  if (unmatched.length > 0 && employees.length > 0) {
    const fuzzy = await fuzzyCandidates(organizationId, unmatched, threshold, maxCandidates);
    for (const r of results) {
      if (r.best === null && r.candidates.length === 0) {
        const cs = fuzzy.get(r.input) ?? [];
        r.candidates = cs;
        r.best = cs[0] ?? null;
        r.sicher = false;
      }
    }
  }
  return results;
}

function candidate(e: EmployeeRow, score: number, method: MatchMethod): MatchCandidate {
  return { employeeId: e.id, name: fullName(e), personalnummer: e.personalnummer, score, method };
}

async function fuzzyCandidates(organizationId: string, inputs: string[], threshold: number, limit: number): Promise<Map<string, MatchCandidate[]>> {
  const out = new Map<string, MatchCandidate[]>();
  for (const input of inputs) {
    const needle = normalizeName(input);
    if (!needle) {
      out.set(input, []);
      continue;
    }
    try {
      const rows = await db.$queryRaw<Array<{ id: string; vorname: string; nachname: string; personalnummer: string | null; score: number }>>(
        Prisma.sql`
          SELECT "id", "vorname", "nachname", "personalnummer",
                 GREATEST(
                   similarity(lower("vorname" || ' ' || "nachname"), ${needle}),
                   similarity(lower("nachname" || ' ' || "vorname"), ${needle})
                 )::float AS score
          FROM "employees"
          WHERE "organizationId" = ${organizationId} AND "status" = 'AKTIV'
            AND GREATEST(
                   similarity(lower("vorname" || ' ' || "nachname"), ${needle}),
                   similarity(lower("nachname" || ' ' || "vorname"), ${needle})
                ) >= ${threshold}
          ORDER BY score DESC
          LIMIT ${limit}`
      );
      out.set(
        input,
        rows.map((r) => ({
          employeeId: r.id,
          name: `${r.vorname} ${r.nachname}`,
          personalnummer: r.personalnummer,
          score: Math.round(Number(r.score) * 100) / 100,
          method: "fuzzy" as const,
        }))
      );
    } catch (err) {
      // pg_trgm nicht verfügbar → JS-Fallback (Bigram-Ähnlichkeit)
      console.warn("Trigram-Matching nicht verfügbar, JS-Fallback:", (err as Error).message);
      const employees = await db.employee.findMany({
        where: { organizationId, status: "AKTIV" },
        select: { id: true, vorname: true, nachname: true, personalnummer: true },
      });
      const scored = employees
        .map((e) => ({ e, score: bigramSimilarity(needle, normalizeName(`${e.vorname} ${e.nachname}`)) }))
        .filter((x) => x.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      out.set(input, scored.map((x) => ({ ...candidate(x.e, Math.round(x.score * 100) / 100, "fuzzy") })));
    }
  }
  return out;
}

export function bigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Map<string, number>();
    const padded = ` ${s} `;
    for (let i = 0; i < padded.length - 1; i++) {
      const g = padded.slice(i, i + 2);
      set.set(g, (set.get(g) ?? 0) + 1);
    }
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of ga) {
    total += n;
    inter += Math.min(n, gb.get(g) ?? 0);
  }
  for (const [, n] of gb) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}
