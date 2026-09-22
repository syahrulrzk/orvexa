import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, agentSkills, skills } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { updateSkillSchema } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function skillOwned(id: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(and(eq(skills.id, id), eq(skills.companyId, companyId)))
    .limit(1);
  return Boolean(row);
}

export async function GET(
  request: Request,
  { params }: { params: { skillId: string } }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  if (!(await skillOwned(params.skillId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Skill tidak ditemukan.", 404);
  }

  const [skill] = await db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      is_builtin: skills.isBuiltin,
      created_at: skills.createdAt,
    })
    .from(skills)
    .where(eq(skills.id, params.skillId))
    .limit(1);

  if (!skill) {
    return apiError("NOT_FOUND", "Skill tidak ditemukan.", 404);
  }

  // Get agents using this skill
  const agents = await db
    .select({
      agent_id: agentSkills.agentId,
    })
    .from(agentSkills)
    .where(eq(agentSkills.skillId, params.skillId));

  return apiOk({ skill: { ...skill, agents: agents.map((a) => a.agent_id) } });
}

export async function PATCH(
  request: Request,
  { params }: { params: { skillId: string } }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  if (!(await skillOwned(params.skillId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Skill tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  const parsed = updateSkillSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .update(skills)
    .set({
      name: data.name ?? undefined,
      description: data.description ?? undefined,
      category: data.category ?? undefined,
    })
    .where(eq(skills.id, params.skillId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "skill.updated",
    targetType: "skill",
    targetId: row.id,
    summary: `Skill diupdate: ${row.name}`,
    metadata: { skill_name: row.name },
  });

  return apiOk({ skill: row });
}

export async function DELETE(
  request: Request,
  { params }: { params: { skillId: string } }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  if (!(await skillOwned(params.skillId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Skill tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  const [row] = await db
    .delete(skills)
    .where(eq(skills.id, params.skillId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "skill.deleted",
    targetType: "skill",
    targetId: row.id,
    summary: `Skill dihapus: ${row.name}`,
    metadata: { skill_name: row.name },
  });

  return apiOk({ deleted: true });
}
