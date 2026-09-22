import { NextResponse } from "next/server";

import { apiOk, authenticate } from "@/lib/api";
import { listActivityFeed } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/activity?limit=100 — feed aktivitas company. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const limit = Math.min(300, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
  const afterParam = url.searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : null;

  const items = await listActivityFeed(auth.company!.id, {
    limit,
    after: after && !Number.isNaN(after.getTime()) ? after : null,
  });

  return apiOk({ activity: items });
}
