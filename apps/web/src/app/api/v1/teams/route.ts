import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, agents, teamMembers, teams } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createTeamSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
});

const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      created_at: teams.createdAt,
      updated_at: teams.updatedAt,
    })
    .from(teams)
    .where(and(eq(teams.companyId, auth.company!.id), isNull(teams.deletedAt)))
    .orderBy(desc(teams.createdAt));

  // Get member counts for each team
  const teamIds = rows.map((r) => r.id);
  const memberCounts = await db
    .select({
      teamId: teamMembers.teamId,
      count: teamMembers.id,
    })
    .from(teamMembers)
    .where(teamIds.length > 0 ? eq(teamMembers.teamId, teamIds[0]) : undefined);

  const countMap = new Map(memberCounts.map((m) => [m.teamId, (memberCounts.filter((c) => c.teamId === m.teamId).length)]));

  const teamsWithCount = rows.map((t) => ({
    ...t,
    member_count: countMap.get(t.id) ?? 0,
  }));

  return apiOk({ teams: teamsWithCount });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "team.create");
  if (denied) return denied;

  const parsed = createTeamSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .insert(teams)
    .values({
      id: newId("tm"),
      companyId: auth.company!.id,
      name: data.name,
      description: data.description ?? null,
    })
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "team.created",
    targetType: "team",
    targetId: row.id,
    summary: `Team dibuat: ${row.name}`,
    metadata: { team_name: row.name },
  });

  return apiOk({ team: row }, 201);
}
