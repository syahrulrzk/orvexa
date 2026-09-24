import { NextResponse } from "next/server";

import { decideApproval } from "@/lib/approvals";
import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ approvalId: string }> };

const decideSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(2000).nullish(),
});

/** POST /api/v1/approvals/:id/decide — keputusan manusia + resume agent. */
export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "approval.decide");
  if (denied) return denied;

  const { approvalId } = await params;
  const parsed = decideSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }

  try {
    const result = await decideApproval({
      approvalId,
      companyId: auth.company!.id,
      decidedBy: auth.user.id,
      decision: parsed.data.decision,
      note: parsed.data.note ?? null,
    });
    return apiOk(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "APPROVAL_NOT_FOUND") {
      return apiError("NOT_FOUND", "Approval tidak ditemukan.", 404);
    }
    if (message === "ALREADY_DECIDED") {
      return apiError("CONFLICT", "Approval sudah diputuskan.", 409);
    }
    return apiError("INTERNAL_ERROR", "Gagal memproses keputusan.", 500);
  }
}
