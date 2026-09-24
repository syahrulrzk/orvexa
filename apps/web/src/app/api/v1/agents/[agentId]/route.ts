import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, agentPermissions, agentRuns, agentSkills, agentTools, agents, skills } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { updateAgentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ agentId: string }> };

/** GET detail agent: skill, tool, run terakhir. */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { agentId } = await params;
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.companyId, auth.company!.id), isNull(agents.deletedAt)))
    .limit(1);
  if (!agent) return apiError("NOT_FOUND", "Agent tidak ditemukan.", 404);

  const skillRows = await db
    .select({
      skillId: agentSkills.skillId,
      name: skills.name,
      category: skills.category,
      description: skills.description,
    })
    .from(agentSkills)
    .innerJoin(skills, eq(agentSkills.skillId, skills.id))
    .where(eq(agentSkills.agentId, agent.id));

  const toolRows = await db
    .select({ toolKey: agentTools.toolKey, isEnabled: agentTools.isEnabled })
    .from(agentTools)
    .where(eq(agentTools.agentId, agent.id));

  const runs = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      triggerKind: agentRuns.triggerKind,
      stepCount: agentRuns.stepCount,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(eq(agentRuns.agentId, agent.id))
    .orderBy(desc(agentRuns.createdAt))
    .limit(5);

  const permissionRows = await db
    .select({
      permission: agentPermissions.permission,
      effect: agentPermissions.effect,
      conditions: agentPermissions.conditions,
    })
    .from(agentPermissions)
    .where(eq(agentPermissions.agentId, agent.id));

  return apiOk({
    agent,
    skills: skillRows,
    tools: toolRows,
    permissions: permissionRows,
    recent_runs: runs,
  });
}

/** PATCH agent: profil, model/provider/kredensial, status, skill & tool (replace-all). */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "agent.configure");
  if (denied) return denied;

  const { agentId } = await params;
  const [existing] = await db
    .select({ id: agents.id, name: agents.name, displayName: agents.displayName })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.companyId, auth.company!.id), isNull(agents.deletedAt)))
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Agent tidak ditemukan.", 404);

  const parsed = updateAgentSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .update(agents)
    .set({
      ...(data.display_name !== undefined ? { displayName: data.display_name ?? null } : {}),
      ...(data.role !== undefined ? { role: data.role ?? null } : {}),
      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.objective !== undefined ? { objective: data.objective ?? null } : {}),
      ...(data.system_prompt !== undefined ? { systemPrompt: data.system_prompt ?? null } : {}),
      ...(data.provider_id !== undefined ? { providerId: data.provider_id ?? null } : {}),
      ...(data.model_id !== undefined ? { modelId: data.model_id ?? null } : {}),
      ...(data.credential_id !== undefined ? { credentialId: data.credential_id ?? null } : {}),
      ...(data.max_steps !== undefined ? { maxSteps: data.max_steps ?? 8 } : {}),
      ...(data.daily_cost_limit !== undefined
        ? { dailyCostLimit: data.daily_cost_limit != null ? String(data.daily_cost_limit) : null }
        : {}),
      ...(data.status !== undefined ? { status: data.status ?? "idle" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId))
    .returning();

  // model_params.default_model untuk model custom (pola yang dibaca resolveAgentProvider)
  if (data.model !== undefined) {
    await db
      .update(agents)
      .set({
        modelParams: { default_model: data.model ?? null },
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));
  }

  // Permission overrides per agent (F5-01): upsert efek per tool.
  if (data.permission_overrides !== undefined) {
    for (const override of data.permission_overrides) {
      const [existingPerm] = await db
        .select({ id: agentPermissions.id })
        .from(agentPermissions)
        .where(and(eq(agentPermissions.agentId, agentId), eq(agentPermissions.permission, override.tool_key)))
        .limit(1);
      if (existingPerm) {
        await db
          .update(agentPermissions)
          .set({ effect: override.effect, conditions: override.conditions ?? {} })
          .where(eq(agentPermissions.id, existingPerm.id));
      } else {
        await db.insert(agentPermissions).values({
          id: newId("apm"),
          companyId: auth.company!.id,
          agentId,
          scopeType: "agent",
          permission: override.tool_key,
          effect: override.effect,
          conditions: override.conditions ?? {},
        });
      }
    }
  }

  // Skill & tool: replace-all bila dikirim
  if (data.skill_ids !== undefined) {
    await db.delete(agentSkills).where(eq(agentSkills.agentId, agentId));
    if (data.skill_ids.length) {
      await db
        .insert(agentSkills)
        .values(data.skill_ids.map((skillId) => ({ agentId, skillId })));
    }
  }
  if (data.tool_keys !== undefined) {
    await db.delete(agentTools).where(eq(agentTools.agentId, agentId));
    if (data.tool_keys.length) {
      await db
        .insert(agentTools)
        .values(data.tool_keys.map((toolKey) => ({ agentId, toolKey })));
    }
  }

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "agent.updated",
    targetType: "agent",
    targetId: agentId,
    summary: `Agent diupdate: ${row.displayName ?? row.name}`,
    metadata: {
      fields: Object.keys(data),
      ...(data.permission_overrides
        ? { permission_overrides: data.permission_overrides.map((o) => ({ tool: o.tool_key, effect: o.effect })) }
        : {}),
    },
  });

  return apiOk({ agent: row });
}

/** DELETE agent — soft delete. */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "agent.delete");
  if (denied) return denied;

  const { agentId } = await params;
  const [existing] = await db
    .select({ id: agents.id, name: agents.name, isBuiltin: agents.isBuiltin })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.companyId, auth.company!.id), isNull(agents.deletedAt)))
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Agent tidak ditemukan.", 404);

  const [row] = await db
    .update(agents)
    .set({ deletedAt: new Date(), status: "disabled" })
    .where(eq(agents.id, agentId))
    .returning({ id: agents.id, name: agents.name });

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "agent.deleted",
    targetType: "agent",
    targetId: agentId,
    summary: `Agent dihapus: ${existing.name}`,
    metadata: { agent_name: existing.name },
  });

  return apiOk({ deleted: true, agent: row });
}