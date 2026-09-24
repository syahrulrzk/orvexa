import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { encryptSecret, hasMasterKey, last4 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { activityLogs, aiCredentials, aiProviders } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { updateProviderSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ providerId: string }> };

/** PATCH provider: label, base_url, default_model, enabled, dan rotasi API key. */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "provider.configure");
  if (denied) return denied;

  const { providerId } = await params;
  const [existing] = await db
    .select({ id: aiProviders.id, label: aiProviders.label })
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.companyId, auth.company!.id),
        isNull(aiProviders.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Provider tidak ditemukan.", 404);

  const parsed = updateProviderSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  // Rotasi API key: nonaktifkan kredensial lama, simpan versi baru.
  let rotatedKey = false;
  if (data.api_key) {
    if (!hasMasterKey()) {
      return apiError(
        "VALIDATION_ERROR",
        "ORVEXA_MASTER_KEY belum diset — kredensial tidak bisa disimpan.",
        400,
      );
    }
    const enc = encryptSecret(data.api_key);
    await db
      .update(aiCredentials)
      .set({ isEnabled: false, deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(aiCredentials.providerId, providerId),
          eq(aiCredentials.isEnabled, true),
          isNull(aiCredentials.deletedAt),
        ),
      );
    await db.insert(aiCredentials).values({
      id: newId("crd"),
      companyId: auth.company!.id,
      providerId,
      label: `${data.label ?? existing.label} key`,
      secretCipher: enc.cipher,
      secretIv: enc.iv,
      keyVersion: enc.keyVersion,
      last4: last4(data.api_key),
      createdBy: auth.user.id,
    });
    rotatedKey = true;
  }

  const [row] = await db
    .update(aiProviders)
    .set({
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.base_url !== undefined ? { baseUrl: data.base_url ?? null } : {}),
      ...(data.is_enabled !== undefined ? { isEnabled: data.is_enabled } : {}),
      ...(data.default_model !== undefined
        ? { config: { default_model: data.default_model ?? null } }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(aiProviders.id, providerId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: rotatedKey ? "provider.key_rotated" : "provider.updated",
    targetType: "provider",
    targetId: providerId,
    summary: rotatedKey
      ? `API key provider dirotasi: ${row.label}`
      : `Provider diupdate: ${row.label}`,
    metadata: { fields: Object.keys(data), key_rotated: rotatedKey },
  });

  return apiOk({ provider: row });
}

/** DELETE provider — soft delete (kredensial ikut dinonaktifkan). */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "provider.configure");
  if (denied) return denied;

  const { providerId } = await params;
  const [existing] = await db
    .select({ id: aiProviders.id, label: aiProviders.label })
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.id, providerId),
        eq(aiProviders.companyId, auth.company!.id),
        isNull(aiProviders.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Provider tidak ditemukan.", 404);

  await db
    .update(aiCredentials)
    .set({ isEnabled: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(aiCredentials.providerId, providerId), isNull(aiCredentials.deletedAt)));

  const [row] = await db
    .update(aiProviders)
    .set({ deletedAt: new Date(), isEnabled: false, updatedAt: new Date() })
    .where(eq(aiProviders.id, providerId))
    .returning({ id: aiProviders.id, label: aiProviders.label });

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "provider.deleted",
    targetType: "provider",
    targetId: providerId,
    summary: `Provider dihapus: ${existing.label}`,
    metadata: { label: existing.label },
  });

  return apiOk({ deleted: true, provider: row });
}
