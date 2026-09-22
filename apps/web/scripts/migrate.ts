/**
 * Runner migrasi sederhana.
 * Mengeksekusi file SQL di folder drizzle/ secara berurutan dan mencatat
 * yang sudah diterapkan di tabel _migrations. Dijalankan tanpa transaksi
 * karena migrasi memuat perintah level database (ALTER DATABASE / extension).
 *
 * Jalankan: npm run db:migrate
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import postgres from "postgres";

function loadEnv(): void {
  const root = resolve(import.meta.dirname, "../../..");
  for (const file of [".env", ".env.local"]) {
    const abs = join(root, file);
    if (existsSync(abs)) {
      try {
        process.loadEnvFile(abs);
      } catch {
        // abaikan
      }
    }
  }
}

async function main(): Promise<void> {
  loadEnv();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL belum diset. Copy .env.example ke .env dulu.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const dir = resolve(import.meta.dirname, "../drizzle");

  try {
    await sql`
      create table if not exists _migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const appliedRows = await sql<{ name: string }[]>`select name from _migrations`;
    const applied = new Set(appliedRows.map((r) => r.name));

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`↷ skip    ${file}`);
        continue;
      }
      const content = readFileSync(join(dir, file), "utf8");
      await sql.unsafe(content);
      await sql`insert into _migrations (name) values (${file})`;
      console.log(`✓ applied ${file}`);
      count += 1;
    }

    console.log(count === 0 ? "Tidak ada migrasi baru." : `Selesai: ${count} migrasi diterapkan.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migrasi gagal:", err);
  process.exit(1);
});
