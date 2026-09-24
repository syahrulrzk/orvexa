import { and, eq, isNull } from "drizzle-orm";

import { db } from "./db";
import { aiCredentials, aiProviders } from "./db/schema";
import { hasMasterKey } from "./crypto";

/**
 * Katalog integrasi (halaman Settings → tab Integrasi).
 *
 * Cakupan saat ini: AI provider + kredensial (sinkron dengan halaman Providers).
 * MCP dan webhooks eksternal menyusul di Fase 6 (F6-01…F6-04) — tampil sebagai
 * "planned" agar pengguna tahu arah produk, bukan silent-missing.
 */

export type IntegrationStatus = "ok" | "warning" | "planned";

export type IntegrationItem = {
  key: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  detail?: string;
};

export async function integrationStatuses(companyId: string): Promise<IntegrationItem[]> {
  const [providerCount, credCount] = await Promise.all([
    db
      .select({ id: aiProviders.id })
      .from(aiProviders)
      .where(and(eq(aiProviders.companyId, companyId), isNull(aiProviders.deletedAt))),
    db
      .select({ id: aiCredentials.id })
      .from(aiCredentials)
      .where(and(eq(aiCredentials.companyId, companyId), isNull(aiCredentials.deletedAt))),
  ]);

  const providersConfigured = providerCount.length > 0;
  const credsConfigured = credCount.length > 0;
  const masterKeyOk = hasMasterKey();
  const redisOk = Boolean(process.env.REDIS_URL?.trim());

  return [
    {
      key: "ai-providers",
      name: "AI Providers",
      description: "Koneksi model (OpenAI, Anthropic, Ollama, dll.) untuk seluruh agent.",
      status: providersConfigured ? "ok" : "warning",
      detail: providersConfigured
        ? `${providerCount.length} provider terkonfigurasi${credsConfigured ? `, ${credCount.length} kredensial terenkripsi` : ""}`
        : "Belum ada provider — tambahkan di halaman AI Providers.",
    },
    {
      key: "credentials",
      name: "Kredensial Terenkripsi",
      description: "API key disimpan AES-256-GCM dengan master key versi.",
      status: masterKeyOk ? "ok" : "warning",
      detail: masterKeyOk
        ? "Master key aktif — enkripsi at-rest siap."
        : "ORVEXA_MASTER_KEY belum diset — kredensial tidak bisa disimpan.",
    },
    {
      key: "job-queue",
      name: "Job Queue (Redis Streams)",
      description: "Antrean pekerjaan agent antara Next.js dan Python worker.",
      status: redisOk ? "ok" : "warning",
      detail: redisOk ? "REDIS_URL terkonfigurasi." : "REDIS_URL belum diset — worker tidak bisa jalan.",
    },
    {
      key: "mcp",
      name: "MCP (Model Context Protocol)",
      description: "Jembatan tool eksternal: Prometheus, Grafana, Wazuh, Docker, Kubernetes.",
      status: "planned",
      detail: "Dibangun di Fase 6 (F6-01…F6-03) — katalog & UI menyusul.",
    },
    {
      key: "webhooks",
      name: "Webhooks Masuk",
      description: "HMAC-SHA256 signed webhook dari sistem eksternal.",
      status: process.env.ORVEXA_WEBHOOK_SECRET?.trim() ? "ok" : "warning",
      detail: process.env.ORVEXA_WEBHOOK_SECRET?.trim()
        ? "ORVEXA_WEBHOOK_SECRET diset — /webhooks/monitoring aktif."
        : "ORVEXA_WEBHOOK_SECRET belum diset — webhook masuk akan ditolak.",
    },
  ];
}
