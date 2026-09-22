import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Hash password dengan Argon2id (lihat docs/SECURITY.md §3.1).
 * `hash()` dari @node-rs/argon2 memakai Argon2id sebagai default.
 * Mengembalikan encoded hash PHC: `$argon2id$v=19$m=...`.
 */
export async function hashPassword(password: string): Promise<string> {
  return argonHash(password);
}

/**
 * Verifikasi password. Mendukung:
 * - Argon2id (format baru)
 * - Legacy scrypt `scrypt$<salt>$<hash>` (data seed lama) — agar sesi lama tidak putus.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$argon2")) {
    try {
      return await argonVerify(stored, password);
    } catch {
      return false;
    }
  }

  const parts = stored.split("$");
  if (parts.length === 3 && parts[0] === "scrypt") {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const derived = await scrypt(password, salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }

  return false;
}

/** Apakah hash perlu di-upgrade ke Argon2id saat verifikasi berikutnya. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith("$argon2");
}
