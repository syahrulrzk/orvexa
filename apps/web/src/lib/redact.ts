/**
 * Redaksi secret untuk audit log (F5-05).
 *
 * Audit log wajib append-only dan bebas secret. Modul ini menyediakan
 * `redactSecrets()` yang dipanggil `logActivity()` pada `summary` & `metadata`
 * sehingga tidak ada jalur penulisan yang bisa lolos membawa secret.
 */

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g, // OpenAI-style
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWT
  /Bearer\s+[A-Za-z0-9._-]{16,}/gi, // Bearer token
  /\b[0-9]{8,10}:[A-Za-z0-9_-]{30,}/g, // Telegram bot token
];

/** Nama field yang nilainya selalu di-redact (case-insensitive). */
const SENSITIVE_KEYS = /^(secret|password|passwd|pwd|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|authorization|cookie|set-cookie|session)$/i;

const REDACTED = "«redacted»";

/** Redaksi pola secret di dalam string bebas. */
export function redactString(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

/** Redaksi nilai berdasarkan nama field (case-insensitive). */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.test(key);
}

/**
 * Redaksi rekursif: string di-scan pola secret, object/array diproses ulang,
 * field sensitif (berdasar nama) diganti «redacted». Aman terhadap referensi
 * melingkar (depth cap). Output JSON-serializable.
 */
export function redactSecrets<T>(value: T, depth = 0): unknown {
  if (depth > 8) return "[depth-limit]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return redactString(value);

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactSecrets(val, depth + 1);
      }
    }
    return out;
  }

  // Fungsi/symbol/ lain → jangan masuk log.
  return "[unserializable]";
}
