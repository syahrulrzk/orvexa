import { reencryptAllCredentials } from "@/lib/keyring";
import { apiError, apiOk, authenticate, guardPermission } from "@/lib/api";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/credentials/rotate
 *
 * Rotasi master key (F5-04): set `ORVEXA_MASTER_KEY` baru di env lalu restart,
 * kemudian panggil endpoint ini untuk mengenkripsi ulang semua kredensial ke
 * key version baru. Kredensial yang gagal didekripsi tidak disentuh.
 * Permission: `credential.manage` (admin/owner saja).
 */
export async function POST(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "credential.manage");
  if (denied) return denied;

  try {
    const report = await reencryptAllCredentials(auth.company!.id);
    return apiOk({ rotation: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "MASTER_KEY_MISSING") {
      return apiError(
        "VALIDATION_ERROR",
        "ORVEXA_MASTER_KEY belum diset — tidak bisa melakukan rotasi.",
        400,
      );
    }
    return apiError("INTERNAL_ERROR", "Rotasi gagal.", 500);
  }
}
