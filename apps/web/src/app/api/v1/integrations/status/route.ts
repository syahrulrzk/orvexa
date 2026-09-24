import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate } from "@/lib/api";
import { integrationStatuses } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/integrations/status — status integrasi per company (katalog Fase 6 menyusul). */
export async function GET() {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;
  if (!auth.company) return apiError("NO_COMPANY", "Kamu bukan anggota company mana pun.", 403);

  const items = await integrationStatuses(auth.company.id);
  return apiOk({ items });
}
