import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiOk, authenticate } from "@/lib/api";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      displayName: agents.displayName,
      role: agents.role,
      status: agents.status,
      isBuiltin: agents.isBuiltin,
    })
    .from(agents)
    .where(and(eq(agents.companyId, auth.company!.id), isNull(agents.deletedAt)))
    .orderBy(asc(agents.name));

  return apiOk({ agents: rows });
}
