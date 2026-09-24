import { and, asc, eq, isNull } from "drizzle-orm";

import { AgentManager } from "@/components/agents/agent-manager";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { agentSkills, agentTools, agents, aiProviders, skills } from "@/lib/db/schema";
import { BUILTIN_TOOLS } from "@/lib/tools";
import { requireSessionContext } from "@/lib/session";

const STATUS_DOT: Record<string, string> = {
  idle: "bg-success",
  thinking: "bg-info",
  working: "bg-info",
  waiting_approval: "bg-warning",
  error: "bg-danger",
  disabled: "bg-neutral",
};

export default async function AgentsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Agents">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      displayName: agents.displayName,
      role: agents.role,
      status: agents.status,
      isBuiltin: agents.isBuiltin,
      providerId: agents.providerId,
    })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), isNull(agents.deletedAt)))
    .orderBy(asc(agents.name));

  const skillLinkRows = await db
    .select({ agentId: agentSkills.agentId, skillId: agentSkills.skillId })
    .from(agentSkills);
  const toolRows = await db
    .select({ agentId: agentTools.agentId, toolKey: agentTools.toolKey, isEnabled: agentTools.isEnabled })
    .from(agentTools);

  const providerRows = await db
    .select({ id: aiProviders.id, kind: aiProviders.kind, label: aiProviders.label })
    .from(aiProviders)
    .where(and(eq(aiProviders.companyId, companyId), isNull(aiProviders.deletedAt)))
    .orderBy(asc(aiProviders.label));

  const skillRows = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.companyId, companyId))
    .orderBy(asc(skills.name));

  const agentOptions = agentRows.map((a) => ({
    ...a,
    skillCount: skillLinkRows.filter((s) => s.agentId === a.id).length,
    toolCount: toolRows.filter((t) => t.agentId === a.id && t.isEnabled).length,
  }));

  const working = agentOptions.filter((a) => a.status === "thinking" || a.status === "working").length;
  const waiting = agentOptions.filter((a) => a.status === "waiting_approval").length;

  return (
    <AppShell
      title="Agents"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">AI Workforce</h2>
            <ul className="mt-3 space-y-2">
              {agentOptions.slice(0, 8).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${STATUS_DOT[a.status] ?? "bg-neutral"}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-fg">{a.displayName ?? a.name}</p>
                    <p className="truncate text-xs text-fg-muted">{a.role ?? `@${a.name}`}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Ringkasan</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex justify-between">
                <span>Total agent</span>
                <span className="font-medium text-fg">{agentOptions.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Sedang bekerja</span>
                <span className="font-medium text-info">{working}</span>
              </li>
              <li className="flex justify-between">
                <span>Menunggu approval</span>
                <span className="font-medium text-warning">{waiting}</span>
              </li>
              <li className="flex justify-between">
                <span>Provider tersambung</span>
                <span className="font-medium text-fg">{providerRows.length}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Agent builtin dipakai runtime worker. Mention <span className="font-mono">@nama</span> di room
              untuk memicunya.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Kelola Agent</h2>
            <p className="text-sm text-fg-muted">
              Identitas, provider, skill, tool, dan batas biaya untuk setiap anggota AI workforce.
            </p>
          </div>
          <Badge variant="outline">{agentOptions.length} agent terdaftar</Badge>
        </div>

        <AgentManager
          agents={agentOptions}
          providers={providerRows}
          skills={skillRows}
          tools={BUILTIN_TOOLS.map((t) => ({
            key: t.key,
            description: t.description,
            requiresApproval: t.requires_approval,
          }))}
        />
      </div>
    </AppShell>
  );
}
