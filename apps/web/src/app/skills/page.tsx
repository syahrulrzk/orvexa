import { asc, eq } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { agentSkills, skills } from "@/lib/db/schema";
import { requireSessionContext } from "@/lib/session";

export default async function SkillsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Skills">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const skillRows = await db
    .select()
    .from(skills)
    .where(eq(skills.companyId, companyId))
    .orderBy(asc(skills.name));

  const linkRows = await db
    .select({ skillId: agentSkills.skillId })
    .from(agentSkills);

  const categories = [...new Set(skillRows.map((s) => s.category).filter(Boolean))] as string[];

  return (
    <AppShell
      title="Skills"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Kategori</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              {categories.map((c) => (
                <li key={c} className="flex justify-between">
                  <span className="capitalize">{c}</span>
                  <span className="font-medium text-fg">{skillRows.filter((s) => s.category === c).length}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Skill di-inject ke system prompt agent saat run. Tautkan skill ke agent dari halaman Agents.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Skill Catalog</h2>
            <p className="text-sm text-fg-muted">Kemampuan reusable yang bisa dipakai banyak agent sekaligus.</p>
          </div>
          <Badge variant="outline">{skillRows.length} skill</Badge>
        </div>

        {skillRows.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-fg-muted">Belum ada skill terdaftar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {skillRows.map((skill) => {
              const agentCount = linkRows.filter((l) => l.skillId === skill.id).length;
              return (
                <Card key={skill.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{skill.name}</CardTitle>
                      {skill.isBuiltin ? <Badge variant="outline">builtin</Badge> : null}
                    </div>
                    {skill.category ? (
                      <p className="text-xs capitalize text-fg-faint">{skill.category}</p>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    {skill.description ? (
                      <p className="line-clamp-2 text-sm text-fg-muted">{skill.description}</p>
                    ) : null}
                    <p className="mt-3 text-xs text-fg-faint">{agentCount} agent memakai</p>
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
