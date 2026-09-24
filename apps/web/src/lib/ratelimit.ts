import { getRedis } from "./redis";

/**
 * Rate limiting (F5-07) — fixed window di Redis.
 *
 * Dipakai di route handler Node (bukan middleware/edge, karena ioredis
 * butuh Node). Pola: `INCR` lalu `PEXPIRE` saat hit pertama.
 *
 * Fail-open saat Redis bermasalah: ketersediaan login/messaging lebih
 * diprioritaskan daripada limit (keputusan MVP, dicatat di SECURITY §9.4).
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Detik sampai window direset. */
  reset_sec: number;
};

export async function rateLimit(input: {
  key: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> {
  const windowMs = input.windowSec * 1000;
  const bucket = `ratelimit:${input.key}:${Math.floor(Date.now() / windowMs)}`;

  try {
    const redis = getRedis();
    const hits = await redis.incr(bucket);
    if (hits === 1) {
      await redis.pexpire(bucket, windowMs);
    }
    const ttl = await redis.pttl(bucket);
    return {
      allowed: hits <= input.limit,
      limit: input.limit,
      remaining: Math.max(input.limit - hits, 0),
      reset_sec: Math.ceil(Math.max(ttl, 0) / 1000),
    };
  } catch {
    // Redis tidak tersedia: jangan blokir trafik (fail-open).
    return { allowed: true, limit: input.limit, remaining: input.limit, reset_sec: input.windowSec };
  }
}

/** Bucket siap pakai (lihat SECURITY.md §9.4). */
export const RATE_LIMITS = {
  /** Login per email — brute force. */
  login: { limit: 5, windowSec: 10 * 60 },
  /** Kirim pesan per user — flood. */
  message: { limit: 60, windowSec: 60 },
  /** Webhook per source — replay/flood. */
  webhook: { limit: 120, windowSec: 60 },
  /** API v1 umum per user. */
  api: { limit: 120, windowSec: 60 },
} as const;
