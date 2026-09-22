import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agents, aiUsage } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { authenticateInternal } from "@/lib/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * POST /api/internal/usage — catat pemakaian token & estimasi biaya,
 * sekaligus mengembalikan akumulasi biaya agent hari ini supaya worker bisa
 * menerapkan budget guard (F3-04).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const body = await readJson(request);
  const agentId = typeof body.agent_id === "string" ? body.agent_id : null;
  const companyId = typeof body.company_id === "string" ? body.company_id : null;
  if (!agentId || !companyId) {
    return apiError("VALIDATION_ERROR", "agent_id dan company_id wajib diisi.", 400);
  }

  const [row] = await db
    .insert(aiUsage)
    .values({
      id: newId("use"),
      companyId,
      agentId,
      runId: typeof body.run_id === "string" ? body.run_id : null,
      providerId: typeof body.provider_id === "string" ? body.provider_id : null,
      modelId: typeof body.model_id === "string" ? body.model_id : null,
      credentialId: typeof body.credential_id === "string" ? body.credential_id : null,
      inputTokens: num(body.input_tokens),
      outputTokens: num(body.output_tokens),
      cachedTokens: num(body.cached_tokens),
      estimatedCost: String(num(body.estimated_cost)),
      latencyMs: typeof body.latency_ms === "number" ? body.latency_ms : null,
    })
    .returning();

  // Akumulasi biaya hari ini (waktu server = WIB sesuai konfigurasi DB).
  const [agg] = await db
    .select({
      costToday: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), 0)`,
      tokensToday: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)`,
    })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.agentId, agentId),
        gte(aiUsage.createdAt, sql`date_trunc('day', now())`),
      ),
    );

  const [agent] = await db
    .select({ dailyCostLimit: agents.dailyCostLimit })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  const costToday = Number(agg?.costToday ?? 0);
  const limit = agent?.dailyCostLimit ? Number(agent.dailyCostLimit) : null;

  return apiOk(
    {
      usage: { id: row.id, input_tokens: row.inputTokens, output_tokens: row.outputTokens },
      cost_today: costToday,
      tokens_today: Number(agg?.tokensToday ?? 0),
      daily_cost_limit: limit,
      budget_exceeded: limit !== null && costToday >= limit,
    },
    201,
  );
}
