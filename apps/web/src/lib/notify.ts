/**
 * Notifikasi keluar (F6-07) — Slack, Telegram, Email (SMTP relay).
 *
 * Semua pengirim memakai kontrak yang sama dan SELALU fail-open: kegagalan
 * pengiriman tidak boleh memblokir alur bisnis (approval, alert, dsb.) —
 * cukup di-log. Kredensial dari env (bukan DB) sesuai MVP self-host.
 *
 * Kanal:
 *  - Slack    : Incoming Webhook (`SLACK_WEBHOOK_URL`)
 *  - Telegram : Bot API (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`)
 *  - Email    : SMTP relay (`SMTP_HOST/PORT/USER/PASS/FROM`) via nodemailer
 *
 * Helper pure (`formatSlackMessage`, `formatTelegramMessage`,
 * `formatEmailMessage`) dipisah agar mudah diuji tanpa jaringan.
 */

// ============================================================
// Tipe & kontrak
// ============================================================

export type NotifyEvent = {
  /** Jenis notifikasi, mis. approval.requested | approval.resolved | alert */
  type: string;
  /** Judul ringkas (wajib). */
  title: string;
  /** Detail tambahan (markdown/plain). */
  body?: string | null;
  severity?: "info" | "warning" | "critical";
  link_url?: string | null;
  company_id?: string | null;
};

export type NotifyChannelResult = {
  channel: "slack" | "telegram" | "email";
  ok: boolean;
  /** true bila channel tidak dikonfigurasi (bukan error). */
  skipped?: boolean;
  error?: string;
};

// ============================================================
// Formatter (pure, mudah diuji)
// ============================================================

const SEVERITY_ICON: Record<string, string> = {
  info: "ℹ️",
  warning: "⚠️",
  critical: "🚨",
};

export function formatSlackMessage(event: NotifyEvent): Record<string, unknown> {
  const icon = SEVERITY_ICON[event.severity ?? "info"];
  const text = [
    `${icon} *${event.title}*`,
    event.body ?? null,
    event.link_url ? `<${event.link_url}|Buka di Orvexa>` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { text, mrkdwn: true };
}

export function formatTelegramMessage(event: NotifyEvent): string {
  const icon = SEVERITY_ICON[event.severity ?? "info"];
  const parts = [`${icon} ${event.title}`];
  if (event.body) parts.push(event.body);
  if (event.link_url) parts.push(event.link_url);
  return parts.join("\n");
}

export function formatEmailMessage(event: NotifyEvent): {
  subject: string;
  html: string;
  text: string;
} {
  const icon = SEVERITY_ICON[event.severity ?? "info"];
  const subject = `[Orvexa] ${event.title}`;
  const bodyHtml = event.body ? `<p>${escapeHtml(event.body).replace(/\n/g, "<br/>")}</p>` : "";
  const linkHtml = event.link_url
    ? `<p><a href="${escapeHtml(event.link_url)}">Buka di Orvexa</a></p>`
    : "";
  return {
    subject,
    html: `<p>${icon} <strong>${escapeHtml(event.title)}</strong></p>${bodyHtml}${linkHtml}`,
    text: [`${icon} ${event.title}`, event.body ?? null, event.link_url ?? null]
      .filter(Boolean)
      .join("\n"),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type NodemailerModule = {
  createTransport?: (opts: unknown) => { sendMail: (opts: unknown) => Promise<unknown> };
};

/** Muat nodemailer opsional via require runtime (bundler-safe). */
function loadNodemailer(): NodemailerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createRequire } = require("node:module") as typeof import("node:module");
    const req = createRequire(import.meta.url);
    return req("nodemailer") as NodemailerModule;
  } catch {
    return null;
  }
}

// ============================================================
// Pengirim (fail-open)
// ============================================================

export async function sendSlack(event: NotifyEvent): Promise<NotifyChannelResult> {
  const url = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!url) return { channel: "slack", ok: true, skipped: true };
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formatSlackMessage(event)),
    });
    if (resp.status >= 400) {
      return { channel: "slack", ok: false, error: `HTTP ${resp.status}` };
    }
    return { channel: "slack", ok: true };
  } catch (err) {
    return { channel: "slack", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendTelegram(event: NotifyEvent): Promise<NotifyChannelResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { channel: "telegram", ok: true, skipped: true };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatTelegramMessage(event) }),
    });
    if (resp.status >= 400) {
      return { channel: "telegram", ok: false, error: `HTTP ${resp.status}` };
    }
    return { channel: "telegram", ok: true };
  } catch (err) {
    return {
      channel: "telegram",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendEmail(event: NotifyEvent, to?: string | null): Promise<NotifyChannelResult> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return { channel: "email", ok: true, skipped: true };
  const recipient = to?.trim() || process.env.SMTP_TO?.trim() || null;
  if (!recipient) return { channel: "email", ok: true, skipped: true };

  // nodemailer opsional — dimuat via createRequire agar bundler (Turbopack)
  // tidak mencoba resolusi statis; bila tidak terpasang, channel email
  // di-skip (fail-open).
  const mod = loadNodemailer();
  if (!mod?.createTransport) {
    return { channel: "email", ok: true, skipped: true, error: "nodemailer tidak terpasang" };
  }
  try {
    const transport = mod.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    const { subject, html, text } = formatEmailMessage(event);
    await transport.sendMail({ from, to: recipient, subject, html, text });
    return { channel: "email", ok: true };
  } catch (err) {
    return { channel: "email", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Kirim ke semua channel terkonfigurasi sekaligus (Promise.allSettled).
 * Selalu resolve — hasil per channel diproses, kegagalan hanya di-log.
 */
export async function notifyAll(
  event: NotifyEvent,
  options: { emailTo?: string | null } = {},
): Promise<NotifyChannelResult[]> {
  const results = await Promise.allSettled([
    sendSlack(event),
    sendTelegram(event),
    sendEmail(event, options.emailTo),
  ]);

  const out: NotifyChannelResult[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") out.push(r.value);
    else out.push({ channel: (["slack", "telegram", "email"] as const)[i], ok: false, error: String(r.reason) });
  }

  for (const r of out) {
    if (!r.ok && !r.skipped) {
      console.warn(`[notify] ${r.channel} gagal: ${r.error}`);
    }
  }
  return out;
}
