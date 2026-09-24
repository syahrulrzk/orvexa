import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { encryptSecret, hasMasterKey, last4 } from "@/lib/crypto";
import { db } from "@/lib/db";
import { activityLogs, aiCredentials, aiModels, aiProviders } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { createProviderSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/providers — daftar provider + kredensial (termasking) + model. */
export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const providerRows = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.companyId, auth.company!.id), isNull(aiProviders.deletedAt)))
    .orderBy(asc(aiProviders.createdAt));

  const providerIds = providerRows.map((p) => p.id);

  const credRows = providerIds.length
    ? await db
        .select({
          id: aiCredentials.id,
          providerId: aiCredentials.providerId,
          label: aiCredentials.label,
          last4: aiCredentials.last4,
          keyVersion: aiCredentials.keyVersion,
          isEnabled: aiCredentials.isEnabled,
          lastUsedAt: aiCredentials.lastUsedAt,
          createdAt: aiCredentials.createdAt,
        })
        .from(aiCredentials)
        .where(and(eq(aiCredentials.companyId, auth.company!.id), isNull(aiCredentials.deletedAt)))
        .orderBy(desc(aiCredentials.createdAt))
    : [];

  const modelRows = providerIds.length
    ? await db.select().from(aiModels).orderBy(desc(aiModels.isDefault))
    : [];

  return apiOk({
    providers: providerRows.map((p) => ({
      ...p,
      credentials: credRows.filter((c) => c.providerId === p.id),
      models: modelRows.filter((m) => m.providerId === p.id),
    })),
    master_key_ready: hasMasterKey(),
  });
}

/** POST /api/v1/providers — daftarkan provider + (opsional) simpan API key terenkripsi. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "provider.configure");
  if (denied) return denied;

  const parsed = createProviderSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  if (data.api_key && !hasMasterKey()) {
    return apiError(
      "VALIDATION_ERROR",
      "ORVEXA_MASTER_KEY belum diset — kredensial tidak bisa disimpan.",
      400,
    );
  }

  // Satu provider per kind per company (sederhana & cukup untuk MVP).
  const [existing] = await db
    .select({ id: aiProviders.id })
    .from(aiProviders)
    .where(
      and(eq(aiProviders.companyId, auth.company!.id), eq(aiProviders.kind, data.kind), isNull(aiProviders.deletedAt)),
    )
    .limit(1);
  if (existing) {
    return apiError("CONFLICT", `Provider kind "${data.kind}" sudah terdaftar.`, 409);
  }

  const [provider] = await db
    .insert(aiProviders)
    .values({
      id: newId("prv"),
      companyId: auth.company!.id,
      kind: data.kind,
      label: data.label,
      baseUrl: data.base_url ?? null,
      isEnabled: data.is_enabled ?? true,
      config: data.default_model ? { default_model: data.default_model } : {},
    })
    .returning();

  if (data.api_key) {
    const enc = encryptSecret(data.api_key);
    await db.insert(aiCredentials).values({
      id: newId("crd"),
      companyId: auth.company!.id,
      providerId: provider.id,
      label: `${data.label} key`,
      secretCipher: enc.cipher,
      secretIv: enc.iv,
      keyVersion: enc.keyVersion,
      last4: last4(data.api_key),
      createdBy: auth.user.id,
    });
  }

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "provider.created",
    targetType: "provider",
    targetId: provider.id,
    summary: `Provider ditambahkan: ${provider.label} (${provider.kind})`,
    metadata: { kind: provider.kind, with_key: Boolean(data.api_key) },
  });

  return apiOk({ provider }, 201);
}
