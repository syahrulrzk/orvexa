import { and, asc, isNull, eq } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { agents, teamMembers, teams } from "@/lib/db/schema";
import { hasPermission } from "@/lib/rbac";
import { requireSessionContext } from "@/lib/session";
import { formatDate } from "@/lib/time";

export default async function TeamsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Teams">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const teamRows = await db
    .select()
    .from(teams)
    .where(and(eq(teams.companyId, companyId), isNull(teams.deletedAt)))
    .orderBy(asc(teams.name));

  const allMembers = await db
    .select({ teamId: teamMembers.teamId, agentId: teamMembers.agentId, userId: teamMembers.userId })
    .from(teamMembers);

  const agentRows = await db
    .select({ id: agents.id, name: agents.displayName, role: agents.role })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), isNull(agents.deletedAt)));

  const agentName = (id: string | null) => agentRows.find((a) => a.id === id)?.name ?? "Agent";

  const canManage = hasPermission(ctx.company!.role, "team.create");

  return (
    <AppShell
      title="Teams"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Ringkasan</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex justify-between">
                <span>Total team</span>
                <span className="font-medium text-fg">{teamRows.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Agent terdaftar</span>
                <span className="font-medium text-fg">{agentRows.length}</span>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Agent bebas</h2>
            <ul className="mt-3 space-y-2">
              {agentRows
                .filter((a) => !allMembers.some((m) => m.agentId === a.id))
                .slice(0, 6)
                .map((a) => (
                  <li key={a.id} className="rounded-md border border-line bg-canvas px-3 py-2">
                    <p className="truncate text-sm text-fg">{a.name ?? "Agent"}</p>
                    <p className="truncate text-xs text-fg-muted">{a.role ?? "—"}</p>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Teams</h2>
            <p className="text-sm text-fg-muted">
              Kelompok agent dengan default room, knowledge, skill, tool, dan permission.
            </p>
          </div>
          {canManage ? <Badge variant="outline">Buat team via API POST /api/v1/teams</Badge> : null}
        </div>

        {teamRows.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-fg-muted">Belum ada team. Buat lewat API <code>POST /api/v1/teams</code>.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {teamRows.map((team) => {
              const members = allMembers.filter((m) => m.teamId === team.id);
              const agentIds = members.map((m) => m.agentId).filter(Boolean) as string[];
              return (
                <Card key={team.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="truncate">{team.name}</CardTitle>
                    {team.description && (
                      <p className="line-clamp-2 text-xs text-fg-muted">{team.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {agentIds.slice(0, 4).map((id) => (
                        <p key={id} className="truncate text-sm text-fg-muted">
                          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-info" aria-hidden />
                          {agentName(id)}
                        </p>
                      ))}
                      {agentIds.length > 4 && (
                        <p className="text-xs text-fg-faint">+{agentIds.length - 4} agent lainnya</p>
                      )}
                      {agentIds.length === 0 && (
                        <p className="text-xs text-fg-faint">Belum ada agent di team ini.</p>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-fg-faint">Dibuat {formatDate(team.createdAt)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
