import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactString, redactSecrets, isSensitiveKey } from "../src/lib/redact.ts";

describe("redact F5-05 — pola secret dalam string", () => {
  it("OpenAI-style key di-redact", () => {
    assert.equal(redactString("key: sk-proj-abcdefgh12345678"), "key: «redacted»");
  });

  it("Bearer token di-redact", () => {
    assert.equal(redactString("Authorization: Bearer abcdef1234567890abcdef"), "Authorization: «redacted»");
  });

  it("JWT di-redact", () => {
    const out = redactString("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fA");
    assert.equal(out, "token «redacted»");
  });

  it("AWS access key di-redact", () => {
    assert.equal(redactString("AKIAIOSFODNN7EXAMPLE"), "«redacted»");
  });

  it("Slack & Telegram token di-redact", () => {
    assert.match(redactString("xoxb-dummytoken-dummytoken-dummy"), /«redacted»/);
    assert.match(redactString("12345678:dummytoken_dummytoken_dummytoken"), /«redacted»/);
  });

  it("teks biasa tidak berubah", () => {
    const text = "Agent menyelesaikan task INC-1042 dengan 3 langkah.";
    assert.equal(redactString(text), text);
  });
});

describe("redact F5-05 — field sensitif & rekursif", () => {
  it("isSensitiveKey mendeteksi variasi nama", () => {
    for (const key of ["api_key", "apiKey", "SECRET", "Authorization", "password", "private_key"]) {
      assert.equal(isSensitiveKey(key), true, key);
    }
    assert.equal(isSensitiveKey("title"), false);
  });

  it("metadata bersarang: field sensitif diganti, string di-scan", () => {
    const input = {
      tool: "doc.generate",
      credentials: { api_key: "super-secret", name: "utama" },
      note: "pakai sk-abcdefgh12345678 sementara",
    };
    const out = redactSecrets(input);
    assert.equal(out.tool, "doc.generate");
    assert.equal(out.credentials.api_key, "«redacted»");
    assert.equal(out.credentials.name, "utama");
    assert.match(out.note, /«redacted»/);
  });

  it("array & Date tetap benar", () => {
    const out = redactSecrets({ items: ["a", "xoxb-dummytoken-dummytoken-dummy"], at: new Date(0) });
    assert.equal(out.items[0], "a");
    assert.match(out.items[1], /«redacted»/);
    assert.equal(out.at, new Date(0).toISOString());
  });

  it("depth cap mencegah referensi melingkar memakan memori", () => {
    const deep = { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: { secret: "sk-abcdefgh12345678" } } } } } } } } } } };
    const out = redactSecrets(deep);
    // kedalaman > 8 ditandai, bukan crash / secret bocor
    const json = JSON.stringify(out);
    assert.ok(!json.includes("sk-abcdefgh12345678"));
  });
});
