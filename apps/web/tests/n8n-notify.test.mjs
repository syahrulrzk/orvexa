import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";

// Env SEBELUM import (modul membaca env saat pemanggilan fungsi).
process.env.ORVEXA_WEBHOOK_SECRET = "test-secret-n8n";

const {
  isN8nEnabled,
  n8nConfig,
  sendToN8n,
  parseN8nInbound,
  signWebhookPayload,
  verifyWebhookSignature,
} = await import("../src/lib/n8n.ts");
const {
  formatSlackMessage,
  formatTelegramMessage,
  formatEmailMessage,
  sendSlack,
  sendTelegram,
  notifyAll,
} = await import("../src/lib/notify.ts");
const { evaluateMcpPermission } = await import("../src/lib/mcp.ts");

describe("n8n F6-05 — config & signature", () => {
  const origUrl = process.env.N8N_WEBHOOK_URL;

  after(() => {
    if (origUrl === undefined) delete process.env.N8N_WEBHOOK_URL;
    else process.env.N8N_WEBHOOK_URL = origUrl;
  });

  it("disabled saat env kosong", () => {
    delete process.env.N8N_WEBHOOK_URL;
    assert.equal(isN8nEnabled(), false);
  });

  it("enabled saat webhook URL + secret terisi", () => {
    process.env.N8N_WEBHOOK_URL = "https://n8n.example.com/webhook/orvexa";
    assert.equal(isN8nEnabled(), true);
    assert.equal(n8nConfig().webhookUrl, "https://n8n.example.com/webhook/orvexa");
  });

  it("signature outbound cocok dengan verifier F5-07 (roundtrip)", () => {
    const body = JSON.stringify({ type: "approval.requested", ts: "x" });
    const ts = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload("test-secret-n8n", body, ts);
    const verdict = verifyWebhookSignature({ body, signature: sig, timestamp: String(ts), secret: "test-secret-n8n" });
    assert.equal(verdict.ok, true);
  });

  it("sendToN8n: mengirim header signature + body benar (fetch diinjeksi)", async () => {
    let captured = null;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return { status: 200, text: async () => "" };
    };
    const result = await sendToN8n({ type: "alert", data: { a: 1 } }, fetchImpl);
    assert.equal(result.ok, true);
    assert.equal(captured.url, "https://n8n.example.com/webhook/orvexa");
    assert.match(captured.init.headers["X-Orvexa-Signature"], /^sha256=[0-9a-f]{64}$/);
    const ts = Number(captured.init.headers["X-Orvexa-Timestamp"]);
    const verdict = verifyWebhookSignature({
      body: captured.init.body,
      signature: captured.init.headers["X-Orvexa-Signature"],
      timestamp: String(ts),
      secret: "test-secret-n8n",
    });
    assert.equal(verdict.ok, true);
  });

  it("sendToN8n: HTTP 500 → ok=false dengan status", async () => {
    const fetchImpl = async () => ({ status: 500, text: async () => "boom" });
    const result = await sendToN8n({ type: "alert" }, fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
  });

  it("parseN8nInbound: post_message / trigger_agent / ping / invalid", () => {
    const pm = parseN8nInbound({ type: "post_message", room_id: "rm_1", content: "halo" });
    assert.equal(pm.ok, true);
    assert.equal(pm.action.type, "post_message");
    assert.equal(pm.action.kind, "text");

    const ta = parseN8nInbound({ type: "trigger_agent", agent_id: "agt_1", task: "cek cpu" });
    assert.equal(ta.ok, true);
    assert.equal(ta.action.type, "trigger_agent");
    assert.equal(ta.action.room_id, null);

    const ping = parseN8nInbound({ type: "ping" });
    assert.equal(ping.ok, true);

    const bad = parseN8nInbound({ type: "post_message" });
    assert.equal(bad.ok, false);
    const unknown = parseN8nInbound({ type: "ngawur" });
    assert.equal(unknown.ok, false);
  });
});

describe("notify F6-07 — formatter & fail-open senders", () => {
  it("formatSlackMessage: ikon severity + link", () => {
    const out = formatSlackMessage({ type: "alert", title: "CPU tinggi", body: "95%", severity: "critical", link_url: "https://x" });
    assert.match(out.text, /🚨 \*CPU tinggi\*/);
    assert.match(out.text, /95%/);
    assert.match(out.text, /<https:\/\/x\|Buka di Orvexa>/);
  });

  it("formatTelegramMessage: plain text", () => {
    const out = formatTelegramMessage({ type: "approval.requested", title: "Approval diminta", severity: "warning" });
    assert.match(out, /^⚠️ Approval diminta$/);
  });

  it("formatEmailMessage: subject/html/text + escape html", () => {
    const out = formatEmailMessage({ type: "alert", title: "A <b> test", body: "baris1\nbaris2", severity: "info" });
    assert.equal(out.subject, "[Orvexa] A <b> test");
    assert.ok(out.html.includes("&lt;b&gt;"));
    assert.ok(out.html.includes("baris1<br/>baris2"));
    assert.ok(out.text.startsWith("ℹ️ A <b> test"));
  });

  it("sendSlack: skipped tanpa env, ok saat HTTP 200", async () => {
    const orig = process.env.SLACK_WEBHOOK_URL;
    delete process.env.SLACK_WEBHOOK_URL;
    const skipped = await sendSlack({ type: "t", title: "x" });
    assert.equal(skipped.skipped, true);

    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.invalid/x";
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ status: 200 });
    const ok = await sendSlack({ type: "t", title: "x" });
    globalThis.fetch = origFetch;
    assert.equal(ok.ok, true);

    if (orig === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = orig;
  });

  it("sendTelegram: skipped tanpa env; error HTTP → ok=false", async () => {
    const origToken = process.env.TELEGRAM_BOT_TOKEN;
    const origChat = process.env.TELEGRAM_CHAT_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    const skipped = await sendTelegram({ type: "t", title: "x" });
    assert.equal(skipped.skipped, true);

    process.env.TELEGRAM_BOT_TOKEN = "tok";
    process.env.TELEGRAM_CHAT_ID = "123";
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ status: 400 });
    const fail = await sendTelegram({ type: "t", title: "x" });
    globalThis.fetch = origFetch;
    assert.equal(fail.ok, false);

    if (origToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = origToken;
    if (origChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = origChat;
  });

  it("notifyAll: selalu resolve, hasil per channel lengkap", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.SMTP_HOST;
    const results = await notifyAll({ type: "t", title: "x" });
    assert.deepEqual(results.map((r) => r.channel).sort(), ["email", "slack", "telegram"]);
    assert.ok(results.every((r) => r.skipped));
  });
});

describe("mcp F6-06 — evaluateMcpPermission (sensitivity guard)", () => {
  it("default: low/medium read-only → allow", () => {
    const d = evaluateMcpPermission("prometheus", "query", { riskLevel: "low" });
    assert.equal(d.effect, "allow");
    const m = evaluateMcpPermission("unifi", "clients", { riskLevel: "medium" });
    assert.equal(m.effect, "allow");
  });

  it("default: high/critical atau requiresApproval → approval_required", () => {
    const h = evaluateMcpPermission("mikrotik", "firewall_modify", { riskLevel: "high" });
    assert.equal(h.effect, "approval_required");
    const c = evaluateMcpPermission("fortigate", "policy_delete", { riskLevel: "critical" });
    assert.equal(c.effect, "approval_required");
    const r = evaluateMcpPermission("docker", "restart", { riskLevel: "low", requiresApproval: true });
    assert.equal(r.effect, "approval_required");
  });

  it("override agent menang: allow / disabled / approval_required", () => {
    const rows = [{ permission: "mcp.prometheus.query", effect: "allow", conditions: {} }];
    assert.equal(evaluateMcpPermission("prometheus", "query", { riskLevel: "low" }, rows).effect, "allow");
    assert.equal(evaluateMcpPermission("prometheus", "query", { riskLevel: "high" }, rows).effect, "allow");

    const dis = [{ permission: "mcp.docker.inspect", effect: "disabled", conditions: {} }];
    assert.equal(evaluateMcpPermission("docker", "inspect", { riskLevel: "low" }, dis).effect, "disabled");

    const appr = [{ permission: "mcp.grafana.get_dashboard", effect: "approval_required", conditions: {} }];
    assert.equal(evaluateMcpPermission("grafana", "get_dashboard", { riskLevel: "low" }, appr).effect, "approval_required");
  });

  it("override allow dengan kondisi room_types: salah room → fail-closed approval", () => {
    const rows = [{ permission: "mcp.wazuh.agents", effect: "allow", conditions: { room_types: ["incident"] } }];
    const ok = evaluateMcpPermission("wazuh", "agents", { riskLevel: "low" }, rows, { roomType: "incident" });
    assert.equal(ok.effect, "allow");
    const fail = evaluateMcpPermission("wazuh", "agents", { riskLevel: "low" }, rows, { roomType: "general" });
    assert.equal(fail.effect, "approval_required");
    const unknown = evaluateMcpPermission("wazuh", "agents", { riskLevel: "low" }, rows, { roomType: null });
    assert.equal(unknown.effect, "approval_required");
  });

  it("tool sensitif lintas server konsisten wajib approval (audit guard)", () => {
    // Pola penamaan *write/modify/delete/restart/deploy* pada tool apa pun
    // yang di-seed dengan risk high/critical → approval_required.
    for (const [server, tool] of [
      ["docker", "container_restart"],
      ["kubernetes", "deployment_scale"],
      ["mikrotik", "interface_disable"],
      ["unifi", "device_adopt"],
      ["wazuh", "agent_restart"],
      ["fortigate", "policy_modify"],
    ]) {
      const d = evaluateMcpPermission(server, tool, { riskLevel: "high" });
      assert.equal(d.effect, "approval_required", `${server}.${tool}`);
    }
  });
});
