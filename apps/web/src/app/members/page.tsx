import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSessionContext } from "@/lib/session";
import { cookies } from "next/headers";

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-brand text-brand-fg",
  admin: "bg-info text-white",
  manager: "bg-warning text-white",
  member: "bg-neutral text-white",
  viewer: "bg-muted-faint text-fg",
};

export default async function MembersPage() {
  const ctx = await requireSessionContext();
  const cookieStore = await cookies();

  // Fetch members from API
  const membersRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/members`, {
    headers: {
      Cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  const membersData = await membersRes.json();
  const members = membersData.success ? membersData.data.members : [];

  return (
    <AppShell title="Members">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Members</h2>
            <p className="text-sm text-muted-foreground">
              Kelola anggota company beserta role-nya.
            </p>
          </div>
          <Button>Invite Member</Button>
        </div>

        {members.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Belum ada member. Invite member pertama Anda.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {members.map((member: any) => (
                  <div key={member.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-canvas-subtle flex items-center justify-center text-sm font-medium">
                        {member.user_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-medium">{member.user_name}</p>
                        <p className="text-sm text-muted-foreground">{member.user_email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={ROLE_COLORS[member.role] || ROLE_COLORS.member}>
                        {member.role}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(member.joined_at).toLocaleDateString('id-ID')}
                      </span>
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
