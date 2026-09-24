import { sql } from "drizzle-orm";

import { db } from "./index";

/**
 * Helper RLS (F5-02) — transaksi per-request dengan `app.company_id` lokal.
 *
 * Saat ini app konek sebagai superuser (BYPASSRLS) sehingga `db` global aman.
 * Setelah aktivasi penuh (`ALTER ROLE orvexa NOSUPERUSER NOBYPASSRLS`), setiap
 * query yang memakai `db` global tanpa GUC akan melihat 0 baris (fail-closed).
 * Pindahkan query ke helper ini agar otomatis ter-scope:
 *
 * ```ts
 * await withTenant(companyId, async (tx) => {
 *   return tx.select().from(agents).where(eq(agents.companyId, companyId));
 * });
 * ```
 *
 * `set_config(..., true)` = lokal transaksi: otomatis reset saat commit/rollback,
 * aman untuk connection pooling.
 */
export async function withTenant<T>(
  companyId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.company_id', ${companyId}, true)`);
    return fn(tx as unknown as Parameters<Parameters<typeof db.transaction>[0]>);
  });
}
