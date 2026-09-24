import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signature verification (F5-07) — kontrak API_SPEC.md §14:
 *
 *   X-Orvexa-Signature: sha256=<hmac_hex>
 *   X-Orvexa-Timestamp: <unix_seconds>
 *   HMAC = HMAC-SHA256(secret, timestamp + "." + raw_body)
 *
 * Aturan:
 *  - Perbandingan signature memakai `timingSafeEqual` (anti timing attack).
 *  - Anti-replay: |now - timestamp| > tolerance → ditolak.
 *  - Secret dari env `ORVEXA_WEBHOOK_SECRET`; kosong → webhook 503 (fail-closed).
 */

export const WEBHOOK_TIMESTAMP_TOLERANCE_SEC = 300;

export function webhookSecret(): string | null {
  const secret = process.env.ORVEXA_WEBHOOK_SECRET?.trim();
  return secret ? secret : null;
}

/** Hitung signature untuk (timestamp, body) — dipakai test & pengirim. */
export function signWebhookPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `sha256=${mac}`;
}

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string };

/** Verifikasi signature + timestamp. `nowSec` bisa diinjeksi untuk test. */
export function verifyWebhookSignature(input: {
  body: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  nowSec?: number;
}): WebhookVerifyResult {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);

  if (!input.signature || !input.timestamp) {
    return { ok: false, reason: "Header X-Orvexa-Signature / X-Orvexa-Timestamp wajib ada." };
  }

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    return { ok: false, reason: "Timestamp tidak valid." };
  }

  if (Math.abs(nowSec - ts) > WEBHOOK_TIMESTAMP_TOLERANCE_SEC) {
    return { ok: false, reason: "Timestamp di luar toleransi (anti-replay)." };
  }

  const expected = signWebhookPayload(input.secret, input.body, ts);
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(input.signature, "utf8");

  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    return { ok: false, reason: "Signature tidak cocok." };
  }

  return { ok: true };
}

/** Baca raw body sebagai string (dipakai sebelum JSON.parse agar hash konsisten). */
export async function readRawBody(request: Request): Promise<string> {
  return request.text();
}
