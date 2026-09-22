import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionContext } from "@/lib/session";
import { cookies } from "next/headers";

export default async function TeamsPage() {
  const ctx = await requireSessionContext();
  const cookieStore = await cookies();

  // Fetch teams from API
  const teamsRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/teams`, {
    headers: {
      Cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  const teamsData = await teamsRes.json();
  const teams = teamsData.success ? teamsData.data.teams : [];

  return (
    <AppShell title="Teams">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Teams</h2>
            <p className="text-sm text-muted-foreground">
              Kelompok agent dengan default room, knowledge, skill, tool, dan permission.
            </p>
          </div>
          <Button>Create Team</Button>
        </div>

        {teams.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Belum ada team. Buat team pertama Anda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team: any) => (
              <Card key={team.id}>
                <CardHeader>
                  <CardTitle>{team.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  {team.description && (
                    <p className="text-sm text-muted-foreground mb-4">{team.description}</p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {team.member_count || 0} members
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(team.created_at).toLocaleDateString('id-ID')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
