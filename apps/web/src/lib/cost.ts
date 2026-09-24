import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "./db";
import { agents, aiUsage } from "./db/schema";
import { APP_TIMEZONE } from "./env";

/**
 * AI cost tracking (F5-06).
 *
 * Sumber data: `ai_usage` (tercatat oleh worker tiap step LLM sejak F3 —
 * input/output/cached token + estimated_cost + latency).
 * Semua biaya dalam USD. Zona waktu agregasi harian: Asia/Jakarta.
 */

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { input_per_1k: number | null; output_per_1k: number | null },
): number {
  let cost = 0;
  if (pricing.input_per_1k != null) cost += (inputTokens / 1000) * pricing.input_per_1k;
  if (pricing.output_per_1k != null) cost += (outputTokens / 1000) * pricing.output_per_1k;
  // Pembulatan 6 desimal agar konsisten dengan kolom numeric(12,6).
  return Math.round(cost * 1e6) / 1e6;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 3600 * 1000);
}

export type CostSummary = {
  today: number;
  d7: number;
  d30: number;
  all: number;
  tokens_30d: { input: number; output: number; cached: number };
  runs_30d: number;
};

/** Ringkasan biaya per periode untuk satu company. */
export async function costSummary(companyId: string): Promise<CostSummary> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      today: sql<number>`coalesce(sum(case when ${aiUsage.createdAt} >= ${startOfToday.toISOString()} then ${aiUsage.estimatedCost} else 0 end), 0)::float8`,
      d7: sql<number>`coalesce(sum(case when ${aiUsage.createdAt} >= ${daysAgo(7).toISOString()} then ${aiUsage.estimatedCost} else 0 end), 0)::float8`,
      d30: sql<number>`coalesce(sum(case when ${aiUsage.createdAt} >= ${daysAgo(30).toISOString()} then ${aiUsage.estimatedCost} else 0 end), 0)::float8`,
      all: sql<number>`coalesce(sum(${aiUsage.estimatedCost}), 0)::float8`,
      input: sql<number>`coalesce(sum(case when ${aiUsage.createdAt} >= ${daysAgo(30).toISOString()} then ${aiUsage.inputTokens} else 0 end), 0)::int`,
      output: sql<number>`coalesce(sum(case when ${aiUsage.createdAt} >= ${daysAgo(30).toISOString()} then ${aiUsage.outputTokens} else 0 end), 0)::int`,
      cached: sql<number>`coalesce(sum(case when ${aiUsage.createdAt} >= ${daysAgo(30).toISOString()} then ${aiUsage.cachedTokens} else 0 end), 0)::int`,
      runs: sql<number>`count(distinct case when ${aiUsage.createdAt} >= ${daysAgo(30).toISOString()} then ${aiUsage.runId} end)::int`,
    })
    .from(aiUsage)
    .where(eq(aiUsage.companyId, companyId));

  return {
    today: row?.today ?? 0,
    d7: row?.d7 ?? 0,
    d30: row?.d30 ?? 0,
    all: row?.all ?? 0,
    tokens_30d: { input: row?.input ?? 0, output: row?.output ?? 0, cached: row?.cached ?? 0 },
    runs_30d: row?.runs ?? 0,
  };
}

export type AgentCostRow = {
  agent_id: string | null;
  agent_name: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  calls: number;
  daily_cost_limit: number | null;
  cost_today: number;
};

/** Rincian biaya per agent (30 hari) + posisi budget harian. */
export async function costByAgent(companyId: string, days = 30): Promise<AgentCostRow[]> {
  const since = daysAgo(days);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      agent_id: aiUsage.agentId,
      agent_name: sql<string>`coalesce(${agents.displayName}, 'unknown')`,
      input_tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
      output_tokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${aiUsage.estimatedCost}), 0)::float8`,
      calls: sql<number>`count(*)::int`,
      daily_cost_limit: agents.dailyCostLimit,
      cost_today: sql<number>`coalesce(sum(case when ${aiUsage.createdAt} >= ${startOfToday.toISOString()} then ${aiUsage.estimatedCost} else 0 end), 0)::float8`,
    })
    .from(aiUsage)
    .leftJoin(agents, eq(agents.id, aiUsage.agentId))
    .where(and(eq(aiUsage.companyId, companyId), gte(aiUsage.createdAt, since)))
    .groupBy(aiUsage.agentId, agents.displayName, agents.dailyCostLimit)
    .orderBy(desc(sql`coalesce(sum(${aiUsage.estimatedCost}), 0)`));

  return rows.map((r) => ({
    ...r,
    daily_cost_limit: r.daily_cost_limit != null ? Number(r.daily_cost_limit) : null,
  }));
}

export type DayCostRow = { day: string; cost: number };

/** Deret biaya harian (untuk grafik batang sederhana). */
export async function costByDay(companyId: string, days = 14): Promise<DayCostRow[]> {
  const since = daysAgo(days);
  const rows = await db
    .select({
      day: sql<string>`to_char((${aiUsage.createdAt} at time zone ${APP_TIMEZONE}::text)::date, 'YYYY-MM-DD')`,
      cost: sql<number>`coalesce(sum(${aiUsage.estimatedCost}), 0)::float8`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.companyId, companyId), gte(aiUsage.createdAt, since)))
    .groupBy(sql`(${aiUsage.createdAt} at time zone ${APP_TIMEZONE}::text)::date`)
    .orderBy(sql`(${aiUsage.createdAt} at time zone ${APP_TIMEZONE}::text)::date`);

  // Isi hari kosong dengan 0 agar grafik proporsional.
  const byDay = new Map(rows.map((r) => [r.day, r.cost]));
  const out: DayCostRow[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toLocaleDateString("sv-SE", { timeZone: APP_TIMEZONE }); // YYYY-MM-DD
    out.push({ day: key, cost: byDay.get(key) ?? 0 });
  }
  return out;
}

export type ModelCostRow = { model: string; cost: number; calls: number };

/** Rincian biaya per model (30 hari). */
export async function costByModel(companyId: string, days = 30): Promise<ModelCostRow[]> {
  const since = daysAgo(days);
  const rows = await db
    .select({
      model: sql<string>`coalesce(${aiUsage.modelId}, 'unknown')`,
      cost: sql<number>`coalesce(sum(${aiUsage.estimatedCost}), 0)::float8`,
      calls: sql<number>`count(*)::int`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.companyId, companyId), gte(aiUsage.createdAt, since)))
    .groupBy(aiUsage.modelId)
    .orderBy(desc(sql`coalesce(sum(${aiUsage.estimatedCost}), 0)`))
    .limit(20);
  return rows;
}

/** Agent aktif untuk filter/context (belum dihapus). */
export async function activeAgents(companyId: string) {
  return db
    .select({ id: agents.id, name: agents.displayName, status: agents.status })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), isNull(agents.deletedAt)));
}
