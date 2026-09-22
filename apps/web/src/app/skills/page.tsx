import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSessionContext } from "@/lib/session";
import { cookies } from "next/headers";

export default async function SkillsPage() {
  const ctx = await requireSessionContext();
  const cookieStore = await cookies();

  // Fetch skills from API
  const skillsRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/skills`, {
    headers: {
      Cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  const skillsData = await skillsRes.json();
  const skills = skillsData.success ? skillsData.data.skills : [];

  return (
    <AppShell title="Skills">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Skills</h2>
            <p className="text-sm text-muted-foreground">
              Katalog skill reusable yang bisa dipakai banyak agent.
            </p>
          </div>
          <Button>Create Skill</Button>
        </div>

        {skills.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Belum ada skill. Buat skill pertama Anda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill: any) => (
              <Card key={skill.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle>{skill.name}</CardTitle>
                    {skill.is_builtin && (
                      <Badge variant="secondary">Builtin</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {skill.description && (
                    <p className="text-sm text-muted-foreground mb-4">{skill.description}</p>
                  )}
                  {skill.category && (
                    <Badge variant="outline" className="mb-4">{skill.category}</Badge>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {skill.agent_count || 0} agents
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(skill.created_at).toLocaleDateString('id-ID')}
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
