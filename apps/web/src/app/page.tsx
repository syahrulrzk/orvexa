import { AppShell } from "@/components/app-shell";

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-overline uppercase text-fg-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-fg">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
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
                className="flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2"
              >
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_COLOR[a.status] ?? "bg-neutral"}`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{a.name}</p>
                  <p className="truncate text-xs text-fg-faint">{a.role}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <div className="space-y-6 p-6">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {STATS.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold text-fg">AI Activity</h2>
            <p className="mt-3 text-sm text-fg-muted">
              Belum ada aktivitas. Agent akan muncul di sini saat mulai bekerja.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold text-fg">Needs Attention</h2>
            <p className="mt-3 text-sm text-fg-muted">
              Tidak ada approval, incident, atau task yang butuh perhatian.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
