import { z } from "zod";

/**
 * Validasi environment variable.
 * Sengaja longgar saat build (nilai default) agar `next build` tidak gagal
 * walau .env belum diisi; runtime akan memvalidasi saat dipakai.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().default("postgres://orvexa:orvexa@localhost:5432/orvexa"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().default("dev-only-insecure-secret-change-me"),
  ORVEXA_MASTER_KEY: z.string().default(""),
  INTERNAL_API_TOKEN: z.string().default(""),
  TZ: z.string().default("Asia/Jakarta"),
  UPLOAD_DIR: z.string().default("./data/uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  ORVEXA_MASTER_KEY: process.env.ORVEXA_MASTER_KEY,
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN,
  TZ: process.env.TZ,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
  MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES,
});

/** Timezone aplikasi — wajib Asia/Jakarta (lihat docs/ARCHITECTURE.md §10.4). */
export const APP_TIMEZONE = "Asia/Jakarta";
