import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, decisions } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { updateDecisionSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ decisionId: string }> };

/** PATCH keputusan: ubah status (approve/reject) atau rationale. */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "approval.decide");
  if (denied) return denied;

  const { decisionId } = await params;
  const [existing] = await db
    .select({ id: decisions.id, status: decisions.status })
    .from(decisions)
    .where(and(eq(decisions.id, decisionId), eq(decisions.companyId, auth.company!.id)))
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Keputusan tidak ditemukan.", 404);

  const parsed = updateDecisionSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .update(decisions)
    .set({
      status: data.status,
      ...(data.rationale !== undefined ? { rationale: data.rationale ?? null } : {}),
      ...(data.status === "approved" ? { approvedBy: auth.user.id, decidedAt: new Date() } : {}),
      ...(data.status !== "approved" ? { approvedBy: null, decidedAt: null } : {}),
    })
    .where(eq(decisions.id, decisionId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "decision.updated",
    targetType: "decision",
    targetId: decisionId,
    summary: `Keputusan ${row.code ?? row.id} → ${row.status}`,
    metadata: { status: row.status },
  });

  return apiOk({ decision: row });
}
