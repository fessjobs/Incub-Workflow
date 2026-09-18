// Einfaches Sliding-Window-Rate-Limit im Prozessspeicher (eine Railway-
// Instanz). Schützt die Token-Routen gegen Erraten: nach dem Limit antwortet
// die Route mit 429. Fehlgeschlagene Token-Lookups werden zusätzlich
// härter limitiert (Brute-Force-Schutz).

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < 15 * 60_000);
    if (b.hits.length === 0) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfterSeconds: 0 };
}

// Fehlversuche (unbekannter Token) je IP zählen – 10 in 15 Minuten
export function registerTokenMiss(ip: string): void {
  checkRateLimit(`miss:${ip}`, 10, 15 * 60_000);
}

export function tooManyTokenMisses(ip: string): boolean {
  const bucket = buckets.get(`miss:${ip}`);
  if (!bucket) return false;
  const now = Date.now();
  return bucket.hits.filter((t) => now - t < 15 * 60_000).length >= 10;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Nur für Tests
export function resetRateLimits(): void {
  buckets.clear();
}
