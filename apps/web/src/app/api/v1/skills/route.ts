import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, agentSkills, skills } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSkillSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  category: z.string().optional(),
});

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const builtin = url.searchParams.get("builtin") === "true";

  const conds = [eq(skills.companyId, auth.company!.id)];
  if (builtin) {
    conds.push(eq(skills.isBuiltin, true));
  } else {
    conds.push(eq(skills.isBuiltin, false));
  }

  const rows = await db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      is_builtin: skills.isBuiltin,
      created_at: skills.createdAt,
    })
    .from(skills)
    .where(and(...conds))
    .orderBy(desc(skills.createdAt));

  // Get agent count for each skill
  const skillIds = rows.map((r) => r.id);
  const agentCounts = skillIds.length > 0
    ? await db
        .select({
          skillId: agentSkills.skillId,
          count: agentSkills.agentId,
        })
        .from(agentSkills)
        .where(eq(agentSkills.skillId, skillIds[0]))
    : [];

  const countMap = new Map();
  for (const ac of agentCounts) {
    countMap.set(ac.skillId, (countMap.get(ac.skillId) || 0) + 1);
  }

  const skillsWithCount = rows.map((s) => ({
    ...s,
    agent_count: countMap.get(s.id) ?? 0,
  }));

  return apiOk({ skills: skillsWithCount });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  const parsed = createSkillSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .insert(skills)
    .values({
      id: newId("skl"),
      companyId: auth.company!.id,
      name: data.name,
      description: data.description ?? null,
      category: data.category ?? null,
      isBuiltin: false,
    })
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "skill.created",
    targetType: "skill",
    targetId: row.id,
    summary: `Skill dibuat: ${row.name}`,
    metadata: { skill_name: row.name, category: row.category },
  });

  return apiOk({ skill: row }, 201);
}
