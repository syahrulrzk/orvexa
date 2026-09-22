import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  __orvexaPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__orvexaPg ??
  postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    // Timestamptz selalu dikirim/dibaca sebagai momen absolut.
    onnotice: () => {},
  });

if (env.NODE_ENV !== "production") {
  globalForDb.__orvexaPg = client;
}

export const db = drizzle(client, { schema });
export { client as pgClient, schema };
