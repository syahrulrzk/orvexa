import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = false;
  try {
    await db.execute(sql`select 1`);
    database = true;
  } catch {
    database = false;
  }

  return NextResponse.json(
    {
      status: database ? "ok" : "degraded",
      service: "orvexa-web",
      timezone: APP_TIMEZONE,
      time: new Date().toISOString(),
      checks: { database },
    },
    { status: database ? 200 : 503 },
  );
}
