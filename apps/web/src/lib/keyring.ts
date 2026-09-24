import { and, eq, isNull } from "drizzle-orm";

import { logActivity } from "./activity";
import {
  decryptSecret,
  encryptSecret,
  hasMasterKey,
  last4,
  type EncryptedSecret,
} from "./crypto";
import { db } from "./db";
import { aiCredentials } from "./db/schema";

/**
 * Keyring & rotasi master key (F5-04).
 *
 * `crypto.ts` menangani satu kunci aktif (AES-256-GCM, versi di kolom
 * `ai_credentials.key_version`). Modul ini menambahkan **rotasi tanpa downtime**:
 *
 * 1. Set `ORVEXA_MASTER_KEY` baru di env.
 * 2. Panggil `reencryptAllCredentials()` (API admin): setiap kredensial
 *    didekripsi dengan kunci lama, dienkripsi ulang dengan kunci baru,
 *    `key_version` dinaikkan. Kredensial yang gagal didekripsi *tidak disentuh*
 *    (aman, bisa dicoba lagi setelah kunci lama dikembalikan).
 * 3. Kunci lama boleh dibuang setelah laporan menunjukkan 0 `failed`.
 */

export type RotationReport = {
  total: number;
  reencrypted: number;
  failed: number;
  from_version: number;
  to_version: number;
  failures: { id: string; label: string; reason: string }[];
};

/** Ambil key_version aktif dari kredensial (paling umum), atau 1. */
async function currentKeyVersion(companyId: string): Promise<number> {
  const rows = await db
    .select({ v: aiCredentials.keyVersion })
    .from(aiCredentials)
    .where(and(eq(aiCredentials.companyId, companyId), isNull(aiCredentials.deletedAt)));
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.v, (counts.get(r.v) ?? 0) + 1);
  let best = 1;
  let bestN = -1;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/**
 * Re-encrypt semua kredensial company ke key version baru.
 * Aman dipanggil berulang: kredensial yang sudah memakai version baru dilewati.
 */
export async function reencryptAllCredentials(companyId: string): Promise<RotationReport> {
  if (!hasMasterKey()) {
    throw new Error("MASTER_KEY_MISSING");
  }

  const fromVersion = await currentKeyVersion(companyId);
  const fresh = encryptSecret("__probe__"); // hanya untuk membaca keyVersion aktif
  const toVersion = fresh.keyVersion;
  void fresh;

  if (toVersion === fromVersion) {
    return {
      total: 0,
      reencrypted: 0,
      failed: 0,
      from_version: fromVersion,
      to_version: toVersion,
      failures: [],
    };
  }

  const rows = await db
    .select()
    .from(aiCredentials)
    .where(and(eq(aiCredentials.companyId, companyId), isNull(aiCredentials.deletedAt)));

  const failures: RotationReport["failures"] = [];
  let reencrypted = 0;

  for (const row of rows) {
    if (row.keyVersion === toVersion) continue; // sudah di kunci baru
    let plaintext: string;
    try {
      plaintext = decryptSecret({ cipher: row.secretCipher, iv: row.secretIv });
    } catch (err) {
      failures.push({
        id: row.id,
        label: row.label,
        reason: err instanceof Error ? err.message : "dekripsi gagal (kunci lama?)",
      });
      continue;
    }

    const enc: EncryptedSecret = encryptSecret(plaintext, toVersion);
    await db
      .update(aiCredentials)
      .set({
        secretCipher: enc.cipher,
        secretIv: enc.iv,
        keyVersion: enc.keyVersion,
        last4: last4(plaintext),
        updatedAt: new Date(),
      })
      .where(eq(aiCredentials.id, row.id));
    reencrypted += 1;
  }

  await logActivity({
    companyId,
    actor: { type: "system" },
    action: "credential.rotated_master_key",
    targetType: "company",
    targetId: companyId,
    summary: `Rotasi master key: ${reencrypted} kredensial dienkripsi ulang ke v${toVersion}${failures.length ? `, ${failures.length} gagal` : ""}.`,
    metadata: { from_version: fromVersion, to_version: toVersion, reencrypted, failed: failures.length },
  });

  return {
    total: rows.length,
    reencrypted,
    failed: failures.length,
    from_version: fromVersion,
    to_version: toVersion,
    failures,
  };
}
