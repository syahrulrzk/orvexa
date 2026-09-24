import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { asc } from "drizzle-orm";

import { db } from "@/lib/db";
import { activityLogs, companies } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { publish } from "@/lib/redis";
import { RATE_LIMITS, rateLimit } from "@/lib/ratelimit";
import { readRawBody, verifyWebhookSignature, webhookSecret } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /webhooks/monitoring — alert dari Prometheus/Wazuh/dll (API_SPEC §14).
 *
 * Keamanan (F5-07):
 *  - HMAC signature + timestamp (anti-replay 300 detik), constant-time compare
 *  - Rate limit per source IP
 *  - Fail-closed: `ORVEXA_WEBHOOK_SECRET` kosong → 503
 *
 * Body sesuai kontrak:
 *   { source, severity, title, labels?, started_at? }
 *
 * MVP: alert dicatat sebagai activity log + event room alerts (bila room
 * `#alerts` ada). Pembuatan incident otomatis menyusul (backlog NB-xx / F6).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = webhookSecret();
  if (!secret) {
    return apiError("INTERNAL_ERROR", "Webhook dinonaktifkan (ORVEXA_WEBHOOK_SECRET kosong).", 503);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit({ key: `webhook:${ip}`, ...RATE_LIMITS.webhook });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak request." } },
      { status: 429, headers: { "Retry-After": String(rl.reset_sec) } },
    );
  }

  const body = await readRawBody(request);
  const verdict = verifyWebhookSignature({
    body,
    signature: request.headers.get("x-orvexa-signature"),
    timestamp: request.headers.get("x-orvexa-timestamp"),
    secret,
  });
  if (!verdict.ok) {
    return apiError("VALIDATION_ERROR", verdict.reason, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Body bukan JSON valid.", 400);
  }

  const source = typeof payload.source === "string" ? payload.source : "unknown";
  const severity = typeof payload.severity === "string" ? payload.severity : "warning";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return apiError("VALIDATION_ERROR", "Field `title` wajib diisi.", 400);
  }

  // Catat alert sebagai aktivitas company (tanpa company scope: log system-level
  // dihubungkan ke company pertama bila ada — webhook generik per-company menyusul).
  const [companyRow] = await db
    .select({ id: companies.id })
    .from(companies)
    .orderBy(asc(companies.createdAt))
    .limit(1);
  const companyId = companyRow?.id;

  if (companyId) {
    const id = newId("act");
    await db.insert(activityLogs).values({
      id,
      companyId,
      actorType: "system",
      action: "webhook.alert_received",
      targetType: "alert",
      targetId: source,
      summary: `[${severity}] ${title}`,
      metadata: { source, severity, labels: payload.labels ?? {}, received_at: new Date().toISOString() },
    });
  }

  // Broadcast ke channel alert terpusat (UI dapat berlangganan bila perlu);
  // room-specific event menyusul bersama incident flow (Fase 6).
  await publish("orvexa.alerts", {
    source,
    severity,
    title,
    labels: payload.labels ?? {},
    ts: new Date().toISOString(),
  });

  return NextResponse.json({ data: { ok: true } }, { status: 202 });
}
