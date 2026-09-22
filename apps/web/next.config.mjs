import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Muat `.env` dari **root monorepo**.
 *
 * `npm run dev -w apps/web` menjalankan Next dengan cwd `apps/web`, sehingga
 * Next hanya membaca `apps/web/.env` dan mengabaikan `.env` di root — padahal
 * di sanalah konfigurasi bersama (DATABASE_URL, INTERNAL_API_TOKEN, kunci
 * provider) berada. `process.loadEnvFile` tidak menimpa variabel yang sudah
 * ada, jadi env dari Docker/compose tetap menang.
 */
const here = dirname(fileURLToPath(import.meta.url));
for (const file of [".env", ".env.local"]) {
  const path = resolve(here, "..", "..", file);
  if (!existsSync(path)) continue;
  try {
    process.loadEnvFile(path);
  } catch {
    // biarkan gagal senyap: env bisa saja diisi lewat docker/systemd
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "postgres"],
};

export default nextConfig;
