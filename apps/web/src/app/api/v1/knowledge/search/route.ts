import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission } from "@/lib/api";
import { retrieveChunks } from "@/lib/retrieval";
import { searchKnowledgeSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/knowledge/search
 * Cari chunk relevan lintas KB (menghormati ACL). Dipakai UI dan tool.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "knowledge.read");
  if (denied) return denied;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Body JSON tidak valid.", 400);
  }

  const parsed = searchKnowledgeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }

  try {
    const results = await retrieveChunks({
      companyId: auth.company!.id,
      agentId: "human-search",
      query: parsed.data.q,
      limit: parsed.data.limit,
      kbId: parsed.data.kb_id ?? null,
      aclMode: "human", // RBAC knowledge.read sudah dicek di route ini
    });
    return apiOk({ results });
  } catch (err) {
    return apiError(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Search gagal.",
      500,
    );
  }
}
