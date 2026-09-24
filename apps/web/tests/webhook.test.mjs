import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  signWebhookPayload,
  verifyWebhookSignature,
  WEBHOOK_TIMESTAMP_TOLERANCE_SEC,
} from "../src/lib/webhook.ts";

const SECRET = "webhook-secret-test-123";
const BODY = JSON.stringify({ source: "prometheus", severity: "warning", title: "High CPU" });

describe("webhook F5-07 — signature & anti-replay", () => {
  const now = 1_790_000_000; // unix detik tetap untuk test

  it("signature valid → ok", () => {
    const sig = signWebhookPayload(SECRET, BODY, now);
    const v = verifyWebhookSignature({
      body: BODY,
      signature: sig,
      timestamp: String(now),
      secret: SECRET,
      nowSec: now,
    });
    assert.equal(v.ok, true);
  });

  it("signature salah → ditolak", () => {
    const sig = signWebhookPayload(SECRET, BODY, now);
    const bad = sig.slice(0, -4) + "0000";
    const v = verifyWebhookSignature({
      body: BODY,
      signature: bad,
      timestamp: String(now),
      secret: SECRET,
      nowSec: now,
    });
    assert.equal(v.ok, false);
  });

  it("body diubah → signature tidak cocok (integritas)", () => {
    const sig = signWebhookPayload(SECRET, BODY, now);
    const tampered = BODY.replace("warning", "critical");
    const v = verifyWebhookSignature({
      body: tampered,
      signature: sig,
      timestamp: String(now),
      secret: SECRET,
      nowSec: now,
    });
    assert.equal(v.ok, false);
  });

  it("secret berbeda → ditolak", () => {
    const sig = signWebhookPayload("secret-lain", BODY, now);
    const v = verifyWebhookSignature({
      body: BODY,
      signature: sig,
      timestamp: String(now),
      secret: SECRET,
      nowSec: now,
    });
    assert.equal(v.ok, false);
  });

  it("timestamp lebih tua dari toleransi → ditolak (replay)", () => {
    const sig = signWebhookPayload(SECRET, BODY, now - WEBHOOK_TIMESTAMP_TOLERANCE_SEC - 1);
    const v = verifyWebhookSignature({
      body: BODY,
      signature: sig,
      timestamp: String(now - WEBHOOK_TIMESTAMP_TOLERANCE_SEC - 1),
      secret: SECRET,
      nowSec: now,
    });
    assert.equal(v.ok, false);
  });

  it("timestamp tepat di batas toleransi → diterima", () => {
    const ts = now - WEBHOOK_TIMESTAMP_TOLERANCE_SEC;
    const sig = signWebhookPayload(SECRET, BODY, ts);
    const v = verifyWebhookSignature({
      body: BODY,
      signature: sig,
      timestamp: String(ts),
      secret: SECRET,
      nowSec: now,
    });
    assert.equal(v.ok, true);
  });

  it("timestamp di masa depan melebihi toleransi → ditolak", () => {
    const ts = now + WEBHOOK_TIMESTAMP_TOLERANCE_SEC + 10;
    const sig = signWebhookPayload(SECRET, BODY, ts);
    const v = verifyWebhookSignature({
      body: BODY,
      signature: sig,
      timestamp: String(ts),
      secret: SECRET,
      nowSec: now,
    });
    assert.equal(v.ok, false);
  });

  it("header hilang / timestamp bukan angka → ditolak", () => {
    const v1 = verifyWebhookSignature({ body: BODY, signature: null, timestamp: "123", secret: SECRET, nowSec: now });
    assert.equal(v1.ok, false);
    const v2 = verifyWebhookSignature({ body: BODY, signature: "sha256=aa", timestamp: "abc", secret: SECRET, nowSec: now });
    assert.equal(v2.ok, false);
  });

  it("format signature sesuai kontrak: sha256=<hex 64>", () => {
    const sig = signWebhookPayload(SECRET, BODY, now);
    assert.match(sig, /^sha256=[a-f0-9]{64}$/);
  });
});
