import { desc, eq } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { companyMembers, users } from "@/lib/db/schema";
import { hasPermission } from "@/lib/rbac";
import { requireSessionContext } from "@/lib/session";
import { formatDate } from "@/lib/time";

const ROLE_VARIANT: Record<string, "default" | "info" | "warning" | "secondary" | "outline"> = {
  owner: "default",
  admin: "info",
  manager: "warning",
  member: "secondary",
  viewer: "outline",
};

const ROLES = ["owner", "admin", "manager", "member", "viewer"];

export default async function MembersPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Members">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const rows = await db
    .select({
      id: companyMembers.id,
      role: companyMembers.role,
      joinedAt: companyMembers.joinedAt,
      userName: users.displayName,
      userEmail: users.email,
    })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(desc(companyMembers.joinedAt));

  const canManage = hasPermission(ctx.company!.role, "member.invite");

  return (
    <AppShell
      title="Members"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Komposisi role</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              {ROLES.map((r) => {
                const n = rows.filter((m) => m.role === r).length;
                return (
                  <li key={r} className="flex justify-between">
                    <span className="capitalize">{r}</span>
                    <span className="font-medium text-fg">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Role menentukan permission via RBAC (lihat docs/SECURITY.md §4). Hanya admin/owner yang bisa
              mengubah role lewat API.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Members</h2>
            <p className="text-sm text-fg-muted">Anggota company beserta role dan tanggal bergabungnya.</p>
          </div>
          {canManage ? <Badge variant="outline">Anda bisa mengelola member</Badge> : null}
        </div>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-fg-muted">Belum ada member.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-line">
                {rows.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas-subtle text-sm font-medium text-fg">
                        {member.userName.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">{member.userName}</p>
                        <p className="truncate text-sm text-fg-muted">{member.userEmail}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge variant={ROLE_VARIANT[member.role] ?? "secondary"}>{member.role}</Badge>
                      <span className="hidden text-xs text-fg-faint sm:inline">{formatDate(member.joinedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
