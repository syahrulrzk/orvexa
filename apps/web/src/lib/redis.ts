import Redis from "ioredis";

import { env } from "./env";

/**
 * Redis dipakai untuk:
 * - Pub/Sub realtime room (`room.events.{room_id}`) → SSE gateway
 * - Job queue agent (Streams) → Fase 3
 *
 * Publisher memakai satu koneksi; subscriber memakai satu koneksi
 * terpisah dengan registry handler per channel.
 */

type MessageHandler = (message: string) => void;

type Hub = {
  publisher: Redis;
  subscriber: Redis;
  handlers: Map<string, Set<MessageHandler>>;
};

const globalForRedis = globalThis as unknown as { __orvexaRedis?: Hub };

function createHub(): Hub {
  const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
  const handlers = new Map<string, Set<MessageHandler>>();

  subscriber.on("message", (channel: string, message: string) => {
    const set = handlers.get(channel);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(message);
      } catch {
        // jangan biarkan satu handler merusak yang lain
      }
    }
  });

  publisher.on("error", () => {});
  subscriber.on("error", () => {});

  return { publisher, subscriber, handlers };
}

function getHub(): Hub {
  if (!globalForRedis.__orvexaRedis) {
    globalForRedis.__orvexaRedis = createHub();
  }
  return globalForRedis.__orvexaRedis;
}

export function getRedis(): Redis {
  return getHub().publisher;
}

/** Publikasikan pesan ke channel Redis. */
export async function publish(channel: string, payload: unknown): Promise<void> {
  const message = typeof payload === "string" ? payload : JSON.stringify(payload);
  await getHub().publisher.publish(channel, message);
}

/** Subscribe ke channel; kembalikan fungsi unsubscribe. */
export async function subscribe(
  channel: string,
  handler: MessageHandler,
): Promise<() => Promise<void>> {
  const hub = getHub();
  let set = hub.handlers.get(channel);
  if (!set) {
    set = new Set();
    hub.handlers.set(channel, set);
    await hub.subscriber.subscribe(channel);
  }
  set.add(handler);

  return async () => {
    const current = hub.handlers.get(channel);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) {
      hub.handlers.delete(channel);
      try {
        await hub.subscriber.unsubscribe(channel);
      } catch {
        // abaikan
      }
    }
  };
}

export const roomChannel = (roomId: string): string => `room.events.${roomId}`;
