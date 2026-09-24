import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { expireStaleApprovals } from "@/lib/approvals";
import { apiOk, authenticate } from "@/lib/api";
import { db } from "@/lib/db";
import { agents, approvals } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/approvals?status=pending — daftar approval (expire on-demand). */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  // Kedaluwarsa diproses saat dibaca (tidak ada scheduler di MVP).
  await expireStaleApprovals(auth.company!.id);

  const status = new URL(request.url).searchParams.get("status");

  const conds = [eq(approvals.companyId, auth.company!.id)];
  if (
    status &&
    ["pending", "approved", "rejected", "expired", "cancelled"].includes(status)
  ) {
    conds.push(eq(approvals.status, status as "pending" | "approved" | "rejected" | "expired" | "cancelled"));
  }

  const rows = await db
    .select({
      id: approvals.id,
      title: approvals.title,
      action: approvals.action,
      payload: approvals.payload,
      riskLevel: approvals.riskLevel,
      status: approvals.status,
      roomId: approvals.roomId,
      agentId: approvals.agentId,
      runId: approvals.runId,
      requestedAt: approvals.requestedAt,
      decidedAt: approvals.decidedAt,
      decidedBy: approvals.decidedBy,
      decisionNote: approvals.decisionNote,
      expiresAt: approvals.expiresAt,
      agentName: agents.displayName,
      agentRole: agents.role,
    })
    .from(approvals)
    .leftJoin(agents, eq(agents.id, approvals.agentId))
    .where(and(...conds))
    .orderBy(desc(approvals.requestedAt))
    .limit(200);

  return apiOk({ approvals: rows });
}
