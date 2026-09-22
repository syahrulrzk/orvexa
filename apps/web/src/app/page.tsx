import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionContext } from "@/lib/session";

const STATS = [
  { label: "Active Projects", value: "0" },
  { label: "Active Agents", value: "5" },
  { label: "Running Tasks", value: "0" },
  { label: "Pending Approvals", value: "0" },
  { label: "Alerts", value: "0" },
];

const AGENTS = [
  { name: "Infra Manager", role: "Team Lead", status: "idle" },
  { name: "SysAdmin", role: "System Administrator", status: "idle" },
  { name: "Network", role: "Network Engineer", status: "idle" },
  { name: "Security", role: "Security Engineer", status: "idle" },
  { name: "NOC", role: "Monitoring", status: "idle" },
];

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-success",
  thinking: "bg-info",
  working: "bg-warning",
  waiting_approval: "bg-warning",
  error: "bg-danger",
  disabled: "bg-neutral",
};

export default async function DashboardPage() {
  const ctx = await requireSessionContext();

  return (
    <AppShell
      title="Dashboard"
      context={
        <div className="p-4">
          <h2 className="text-overline uppercase text-fg-faint">Agent Team</h2>
          <ul className="mt-3 space-y-2">
            {AGENTS.map((a) => (
              <li
                key={a.name}
                className="flex items-center gap-2 rounded-md border border-border bg-canvas px-3 py-2"
              >
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_COLOR[a.status] ?? "bg-neutral"}`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{a.role}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Selamat datang, {ctx.user.displayName}</CardTitle>
            <CardDescription>
              {ctx.company
                ? `Workspace: ${ctx.company.name} · role: ${ctx.company.role}`
                : "Belum tergabung di company mana pun."}
            </CardDescription>
          </CardHeader>
        </Card>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {STATS.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-overline uppercase text-fg-faint">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>AI Activity</CardTitle>
              <CardDescription>
                Belum ada aktivitas. Agent akan muncul di sini saat mulai bekerja.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs Attention</CardTitle>
              <CardDescription>
                Tidak ada approval, incident, atau task yang butuh perhatian.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
