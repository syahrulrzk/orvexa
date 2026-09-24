import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, agents, teamMembers, teams } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { updateTeamSchema } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function teamOwned(id: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.companyId, companyId)))
    .limit(1);
  return Boolean(row);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { teamId } = await params;
  if (!(await teamOwned(teamId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Team tidak ditemukan.", 404);
  }

  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      created_at: teams.createdAt,
      updated_at: teams.updatedAt,
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  if (!team) {
    return apiError("NOT_FOUND", "Team tidak ditemukan.", 404);
  }

  // Get members (agents and users)
  const members = await db
    .select({
      id: teamMembers.id,
      agent_id: teamMembers.agentId,
      user_id: teamMembers.userId,
      added_at: teamMembers.addedAt,
      agent_name: agents.name,
      agent_role: agents.role,
    })
    .from(teamMembers)
    .leftJoin(agents, eq(teamMembers.agentId, agents.id))
    .where(eq(teamMembers.teamId, teamId));

  return apiOk({ team: { ...team, members } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { teamId } = await params;
  if (!(await teamOwned(teamId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Team tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "team.update");
  if (denied) return denied;

  const parsed = updateTeamSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .update(teams)
    .set({
      name: data.name ?? undefined,
      description: data.description ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(teams.id, teamId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "team.updated",
    targetType: "team",
    targetId: row.id,
    summary: `Team diupdate: ${row.name}`,
    metadata: { team_name: row.name },
  });

  return apiOk({ team: row });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { teamId } = await params;
  if (!(await teamOwned(teamId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Team tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "team.delete");
  if (denied) return denied;

  const [row] = await db
    .update(teams)
    .set({ deletedAt: new Date() })
    .where(eq(teams.id, teamId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "team.deleted",
    targetType: "team",
    targetId: row.id,
    summary: `Team dihapus: ${row.name}`,
    metadata: { team_name: row.name },
  });

  return apiOk({ deleted: true });
}
