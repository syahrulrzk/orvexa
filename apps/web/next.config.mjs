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
const isDev = process.env.NODE_ENV === "development";

// CSP: Next dev butuh 'unsafe-eval' (HMR); produksi ketat. 'unsafe-inline'
// untuk style diperlukan Tailwind-inlined di Next 16.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'" + (isDev ? " ws: wss:" : ""),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "postgres"],
  // Host domain (Caddy) yang mengakses dev server — supaya HMR websocket
  // /_next/hmr tidak diblokir cross-origin saat development via domain.
  allowedDevOrigins: ["originlabs.my.id"],
  // F5-07: security headers (SECURITY.md §9).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
