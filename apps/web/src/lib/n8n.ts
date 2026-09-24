import { signWebhookPayload } from "./webhook";

/**
 * Integrasi n8n (F6-05).
 *
 * Dua arah:
 *  - **Outbound** — Orvexa memicu workflow n8n via webhook URL
 *    (`N8N_WEBHOOK_URL`), dengan signature sama seperti kontrak F5-07
 *    (`sha256=<hmac>`, `t=<unix>`); secret `ORVEXA_WEBHOOK_SECRET`.
 *  - **Inbound** — workflow n8n memanggil Orvexa via `/webhooks/n8n`
 *    (post message ke room, trigger agent). Verifikasi signature di sisi web.
 *
 * Semua fungsi pure / tanpa I/O berat agar mudah diuji.
 */

export type N8nOutboundResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

/** Env kunci konfigurasi n8n. Kosong → integrasi off (fail-closed di pemanggil). */
export function n8nConfig(): { webhookUrl: string | null; secret: string | null } {
  return {
    webhookUrl: process.env.N8N_WEBHOOK_URL?.trim() || null,
    secret: process.env.ORVEXA_WEBHOOK_SECRET?.trim() || null,
  };
}

/** Apakah integrasi n8n aktif (env terisi). */
export function isN8nEnabled(): boolean {
  const { webhookUrl, secret } = n8nConfig();
  return Boolean(webhookUrl && secret);
}

/**
 * Kirim event ke webhook n8n (outbound). Signature = kontrak API_SPEC §14.
 * `fetchImpl` bisa diinjeksi untuk test.
 */
export async function sendToN8n(
  event: {
    type: string;
    company_id?: string | null;
    room_id?: string | null;
    agent_id?: string | null;
    data?: unknown;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<N8nOutboundResult> {
  const { webhookUrl, secret } = n8nConfig();
  if (!webhookUrl || !secret) {
    return { ok: false, error: "n8n tidak aktif (N8N_WEBHOOK_URL / ORVEXA_WEBHOOK_SECRET kosong)." };
  }

  const body = JSON.stringify({ ...event, ts: new Date().toISOString() });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(secret, body, timestamp);

  try {
    const resp = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Orvexa-Signature": signature,
        "X-Orvexa-Timestamp": String(timestamp),
      },
      body,
    });
    if (resp.status >= 400) {
      return { ok: false, status: resp.status, error: (await resp.text()).slice(0, 200) };
    }
    return { ok: true, status: resp.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================
// Inbound (dipakai route /webhooks/n8n)
// ============================================================

export type N8nInboundAction =
  | { type: "post_message"; room_id: string; content: string; kind?: string }
  | { type: "trigger_agent"; agent_id: string; room_id: string | null; task: string }
  | { type: "ping" };

/** Validasi & normalisasi payload inbound dari n8n. */
export function parseN8nInbound(payload: Record<string, unknown>): { ok: true; action: N8nInboundAction } | { ok: false; error: string } {
  const type = typeof payload.type === "string" ? payload.type : "";

  if (type === "ping") {
    return { ok: true, action: { type: "ping" } };
  }

  if (type === "post_message") {
    const roomId = typeof payload.room_id === "string" ? payload.room_id.trim() : "";
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    if (!roomId) return { ok: false, error: "Field `room_id` wajib diisi." };
    if (!content) return { ok: false, error: "Field `content` wajib diisi." };
    const kind = payload.kind === "alert" ? "alert" : "text";
    return { ok: true, action: { type: "post_message", room_id: roomId, content, kind } };
  }

  if (type === "trigger_agent") {
    const agentId = typeof payload.agent_id === "string" ? payload.agent_id.trim() : "";
    const task = typeof payload.task === "string" ? payload.task.trim() : "";
    if (!agentId) return { ok: false, error: "Field `agent_id` wajib diisi." };
    if (!task) return { ok: false, error: "Field `task` wajib diisi." };
    const roomId = typeof payload.room_id === "string" ? payload.room_id.trim() : null;
    return { ok: true, action: { type: "trigger_agent", agent_id: agentId, room_id: roomId, task } };
  }

  return { ok: false, error: `Tipe aksi n8n tidak dikenal: "${type || "(kosong)"}".` };
}

// Re-export agar route cukup import dari satu tempat.
export { signWebhookPayload, verifyWebhookSignature, webhookSecret } from "./webhook";
