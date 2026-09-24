import { NextResponse } from "next/server";

import { authenticate } from "@/lib/api";
import { loadOfficeSnapshot } from "@/lib/office";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/office — snapshot denah Virtual Office (Phase 10).
 *
 * State dibaca langsung dari DB (agents.status, task aktif, run terakhir,
 * activity feed). Realtime update via SSE `/api/v1/office/events`.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;
  if (!auth.company) {
    return NextResponse.json(
      { error: { code: "NO_COMPANY", message: "User belum tergabung di company mana pun." } },
      { status: 403 },
    );
  }

  const snapshot = await loadOfficeSnapshot(auth.company.id);
  return NextResponse.json({ data: snapshot });
}
