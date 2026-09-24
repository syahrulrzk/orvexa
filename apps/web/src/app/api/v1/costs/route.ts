import { NextResponse } from "next/server";

import { apiOk, authenticate } from "@/lib/api";
import { costByAgent, costByDay, costByModel, costSummary } from "@/lib/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/costs?days=30
 *
 * AI cost tracking (F5-06). Mengembalikan ringkasan per periode, rincian
 * per agent (dengan posisi budget harian), deret harian, dan per model.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 1), 90);

  const [summary, perAgent, perDay, perModel] = await Promise.all([
    costSummary(auth.company!.id),
    costByAgent(auth.company!.id, days),
    costByDay(auth.company!.id, Math.min(days, 30)),
    costByModel(auth.company!.id, days),
  ]);

  return apiOk({ days, summary, per_agent: perAgent, per_day: perDay, per_model: perModel });
}
