// Blob-Speicher für Unterschriften (PNG). In der Datenbank steht nur die
// Referenz (URL), nie Base64. Zwei Adapter:
//  - DB (Standard, Tabelle blobs) – funktioniert ohne weitere Infrastruktur
//  - S3-kompatibel (wenn S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID,
//    S3_SECRET_ACCESS_KEY gesetzt sind) – AWS SigV4 ohne Zusatzabhängigkeit
import { createHash, createHmac, randomBytes } from "crypto";
import { db } from "@/lib/db";

export type StoredBlob = { url: string; key: string; size: number };

export type BlobAdapter = {
  name: string;
  put(orgId: string, key: string, bytes: Buffer, mimeType: string): Promise<StoredBlob>;
  get(url: string): Promise<{ bytes: Buffer; mimeType: string } | null>;
};

export const BLOB_URL_PREFIX = "/api/blobs/";

const dbAdapter: BlobAdapter = {
  name: "db",
  async put(orgId, key, bytes, mimeType) {
    const row = await db.blob.create({
      data: { organizationId: orgId, key, mimeType, bytes: new Uint8Array(bytes), size: bytes.length },
      select: { id: true },
    });
    return { url: `${BLOB_URL_PREFIX}${row.id}`, key, size: bytes.length };
  },
  async get(url) {
    if (!url.startsWith(BLOB_URL_PREFIX)) return null;
    const id = url.slice(BLOB_URL_PREFIX.length);
    const row = await db.blob.findUnique({ where: { id } });
    if (!row) return null;
    return { bytes: Buffer.from(row.bytes), mimeType: row.mimeType };
  },
};

// ─── S3 (SigV4) ─────────────────────────────────────────────────────────────

type S3Config = { bucket: string; endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; pathStyle: boolean };

function s3Config(): S3Config | null {
  const { S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_PATH_STYLE } = process.env;
  if (!S3_BUCKET || !S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  return {
    bucket: S3_BUCKET,
    endpoint: S3_ENDPOINT.replace(/\/+$/, ""),
    region: S3_REGION ?? "auto",
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    pathStyle: S3_PATH_STYLE !== "false",
  };
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function amzDate(d: Date): { date: string; dateTime: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { date: iso.slice(0, 8), dateTime: iso };
}

async function s3Request(cfg: S3Config, method: "PUT" | "GET", key: string, body?: Buffer, contentType?: string): Promise<Response> {
  const url = new URL(cfg.pathStyle ? `${cfg.endpoint}/${cfg.bucket}/${key}` : `${cfg.endpoint.replace("://", `://${cfg.bucket}.`)}/${key}`);
  const payloadHash = sha256Hex(body ?? "");
  const { date, dateTime } = amzDate(new Date());
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": dateTime,
  };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h].trim()}\n`).join("");
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaderNames.join(";"), payloadHash].join("\n");
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", dateTime, scope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, date);
  const kRegion = hmac(kDate, cfg.region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`;
  const { host: _host, ...sendHeaders } = headers;
  void _host;
  return fetch(url, {
    method,
    headers: { ...sendHeaders, authorization },
    body: body ? new Uint8Array(body) : undefined,
  });
}

const s3Adapter: BlobAdapter = {
  name: "s3",
  async put(_orgId, key, bytes, mimeType) {
    const cfg = s3Config();
    if (!cfg) throw new Error("S3 nicht konfiguriert");
    const res = await s3Request(cfg, "PUT", key, bytes, mimeType);
    if (!res.ok) throw new Error(`S3 PUT fehlgeschlagen: ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
    return { url: `s3://${cfg.bucket}/${key}`, key, size: bytes.length };
  },
  async get(url) {
    const cfg = s3Config();
    if (!cfg || !url.startsWith("s3://")) return null;
    const key = url.replace(`s3://${cfg.bucket}/`, "");
    const res = await s3Request(cfg, "GET", key);
    if (!res.ok) return null;
    return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: res.headers.get("content-type") ?? "application/octet-stream" };
  },
};

export function activeBlobAdapter(): BlobAdapter {
  return s3Config() ? s3Adapter : dbAdapter;
}

export function newBlobKey(orgId: string, prefix: string, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  return `${orgId}/${prefix}/${stamp}/${randomBytes(12).toString("hex")}.${ext}`;
}

export async function putBlob(orgId: string, prefix: string, bytes: Buffer, mimeType: string): Promise<StoredBlob> {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : "bin";
  return activeBlobAdapter().put(orgId, newBlobKey(orgId, prefix, ext), bytes, mimeType);
}

// Liest über den passenden Adapter (URL-Schema entscheidet)
export async function getBlob(url: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (url.startsWith("s3://")) return s3Adapter.get(url);
  return dbAdapter.get(url);
}

// Unterschrift aus Data-URL (Canvas → PNG) dekodieren, mit Größenlimit
export function decodeSignatureDataUrl(dataUrl: string, maxBytes = 512 * 1024): Buffer {
  const m = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) throw new Error("Unterschrift muss ein PNG (Data-URL) sein.");
  const bytes = Buffer.from(m[1].replace(/\s/g, ""), "base64");
  if (bytes.length < 200) throw new Error("Unterschrift ist leer.");
  if (bytes.length > maxBytes) throw new Error("Unterschrift ist zu groß.");
  // PNG-Signatur prüfen
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Unterschrift ist kein gültiges PNG.");
  return bytes;
}
