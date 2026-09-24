import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, agentSkills, agentTools, agents } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { createAgentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/agents — daftar agent company + provider & ringkasan skill/tool. */
export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      displayName: agents.displayName,
      role: agents.role,
      description: agents.description,
      status: agents.status,
      isBuiltin: agents.isBuiltin,
      providerId: agents.providerId,
      modelId: agents.modelId,
      credentialId: agents.credentialId,
      maxSteps: agents.maxSteps,
      dailyCostLimit: agents.dailyCostLimit,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(and(eq(agents.companyId, auth.company!.id), isNull(agents.deletedAt)))
    .orderBy(asc(agents.name));

  const agentIds = rows.map((r) => r.id);

  const skillRows = agentIds.length
    ? await db
        .select({ agentId: agentSkills.agentId, skillId: agentSkills.skillId })
        .from(agentSkills)
        .where(eq(agentSkills.agentId, agentIds[0]))
    : [];
  const skillCount = new Map<string, number>();
  for (const row of skillRows) {
    skillCount.set(row.agentId, (skillCount.get(row.agentId) ?? 0) + 1);
  }

  const toolRows = agentIds.length
    ? await db
        .select({ agentId: agentTools.agentId, toolKey: agentTools.toolKey, isEnabled: agentTools.isEnabled })
        .from(agentTools)
    : [];
  const toolCount = new Map<string, number>();
  for (const row of toolRows) {
    if (row.isEnabled) toolCount.set(row.agentId, (toolCount.get(row.agentId) ?? 0) + 1);
  }

  const agentsWithCounts = rows.map((a) => ({
    ...a,
    skill_count: skillCount.get(a.id) ?? 0,
    tool_count: toolCount.get(a.id) ?? 0,
  }));

  return apiOk({ agents: agentsWithCounts });
}

/** POST /api/v1/agents — buat agent baru (dengan skill/tool/KB opsional). */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "agent.create");
  if (denied) return denied;

  const parsed = createAgentSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  // Unik per company: name
  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.companyId, auth.company!.id), eq(agents.name, data.name)))
    .limit(1);
  if (existing) {
    return apiError("CONFLICT", `Agent "${data.name}" sudah ada.`, 409);
  }

  const [row] = await db
    .insert(agents)
    .values({
      id: newId("agt"),
      companyId: auth.company!.id,
      name: data.name,
      displayName: data.display_name ?? data.name,
      role: data.role ?? null,
      description: data.description ?? null,
      objective: data.objective ?? null,
      systemPrompt: data.system_prompt ?? null,
      providerId: data.provider_id ?? null,
      modelId: data.model_id ?? null,
      credentialId: data.credential_id ?? null,
      maxSteps: data.max_steps ?? 8,
      dailyCostLimit: data.daily_cost_limit != null ? String(data.daily_cost_limit) : null,
      createdBy: auth.user.id,
    })
    .returning();

  // Tautkan skill & tool yang diminta
  if (data.skill_ids?.length) {
    await db
      .insert(agentSkills)
      .values(data.skill_ids.map((skillId) => ({ agentId: row.id, skillId })));
  }
  if (data.tool_keys?.length) {
    await db
      .insert(agentTools)
      .values(data.tool_keys.map((toolKey) => ({ agentId: row.id, toolKey })));
  }

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "agent.created",
    targetType: "agent",
    targetId: row.id,
    summary: `Agent dibuat: ${row.displayName ?? row.name}`,
    metadata: { agent_name: row.name },
  });

  return apiOk({ agent: row }, 201);
}