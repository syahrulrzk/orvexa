import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "./env";

/**
 * Enkripsi kredensial provider (AES-256-GCM). Lihat SECURITY.md §6.
 *
 * Master key berasal dari `ORVEXA_MASTER_KEY` (base64 32 byte).
 * Format ciphertext disimpan di `ai_credentials.secret_cipher` dan IV di
 * `secret_iv` (dua kolom terpisah sesuai schema).
 *
 * `key_version` memungkinkan rotasi kunci tanpa membongkar data lama.
 */

const ALGO = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;

export class MasterKeyMissingError extends Error {
  constructor() {
    super("ORVEXA_MASTER_KEY belum diset — tidak bisa mengenkripsi/mendekripsi kredensial.");
    this.name = "MasterKeyMissingError";
  }
}

function loadKey(): Buffer {
  const raw = env.ORVEXA_MASTER_KEY?.trim();
  if (!raw) throw new MasterKeyMissingError();

  // Terima base64 (disarankan) maupun hex 64 karakter.
  const buffer = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (buffer.length !== 32) {
    throw new Error(
      `ORVEXA_MASTER_KEY harus 32 byte (base64 44 char / hex 64 char), dapat ${buffer.length} byte.`,
    );
  }
  return buffer;
}

export function hasMasterKey(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

export type EncryptedSecret = { cipher: string; iv: string; keyVersion: number };

/** Enkripsi plaintext secret. IV acak 12 byte per operasi. */
export function encryptSecret(plaintext: string, keyVersion = 1): EncryptedSecret {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    cipher: Buffer.concat([encrypted, tag]).toString("base64"),
    iv: iv.toString("base64"),
    keyVersion,
  };
}

/** Dekripsi secret. Melempar bila cipher/IV rusak atau kunci salah. */
export function decryptSecret(payload: { cipher: string; iv: string }): string {
  const key = loadKey();
  const data = Buffer.from(payload.cipher, "base64");
  const iv = Buffer.from(payload.iv, "base64");

  if (data.length <= AUTH_TAG_BYTES) throw new Error("Ciphertext kredensial tidak valid.");

  const encrypted = data.subarray(0, data.length - AUTH_TAG_BYTES);
  const tag = data.subarray(data.length - AUTH_TAG_BYTES);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/** Empat karakter terakhir untuk masking di UI (`sk-...ab12`). */
export function last4(secret: string): string {
  return secret.slice(-4);
}
