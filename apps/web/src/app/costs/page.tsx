import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { costByAgent, costByDay, costByModel, costSummary } from "@/lib/cost";
import { requireSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

function usd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function CostsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="AI Costs">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const [summary, perAgent, perDay, perModel] = await Promise.all([
    costSummary(companyId),
    costByAgent(companyId),
    costByDay(companyId, 14),
    costByModel(companyId),
  ]);

  const maxDay = Math.max(...perDay.map((d) => d.cost), 0.000001);
  const total30Tokens = summary.tokens_30d.input + summary.tokens_30d.output;

  return (
    <AppShell
      title="AI Costs"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Catatan</h2>
            <p className="mt-3 text-xs text-fg-muted">
              Biaya dihitung dari harga per 1K token pada model terdaftar (ai_models) dan dicatat
              worker di setiap step LLM. Zona waktu agregasi: Asia/Jakarta.
            </p>
          </div>
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Kontrol biaya</h2>
            <ul className="mt-3 space-y-1.5 text-xs text-fg-muted">
              <li>• Limit biaya harian diatur per agent (halaman Agents).</li>
              <li>• BudgetGuard menghentikan run saat limit terlampaui.</li>
              <li>• Cached token tidak dihitung ulang penuh oleh provider.</li>
            </ul>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">AI Cost Tracking</h2>
            <p className="text-sm text-fg-muted">
              Penggunaan token &amp; biaya LLM per agent, model, dan hari.
            </p>
          </div>
          <Badge variant="outline">{summary.runs_30d} run dalam 30 hari</Badge>
        </div>

        {/* Ringkasan periode */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-overline uppercase text-fg-faint">Hari ini</p>
              <p className="mt-1 text-2xl font-semibold text-fg">{usd(summary.today)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-overline uppercase text-fg-faint">7 hari</p>
              <p className="mt-1 text-2xl font-semibold text-fg">{usd(summary.d7)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-overline uppercase text-fg-faint">30 hari</p>
              <p className="mt-1 text-2xl font-semibold text-fg">{usd(summary.d30)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-overline uppercase text-fg-faint">Total</p>
              <p className="mt-1 text-2xl font-semibold text-fg">{usd(summary.all)}</p>
            </CardContent>
          </Card>
        </section>

        {/* Grafik harian 14 hari */}
        <Card>
          <CardHeader>
            <CardTitle>Biaya 14 hari terakhir</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-36 items-end gap-1.5">
              {perDay.map((d) => (
                <div key={d.day} className="group flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="hidden font-mono text-xs text-fg-muted group-hover:block">
                    {usd(d.cost)}
                  </span>
                  <div
                    className="w-full rounded-t-sm bg-info/70 transition-colors group-hover:bg-info"
                    style={{ height: `${Math.max((d.cost / maxDay) * 100, d.cost > 0 ? 4 : 1)}%` }}
                    title={`${d.day}: ${usd(d.cost)}`}
                  />
                  <span className="hidden text-xs text-fg-faint sm:block">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          {/* Per agent */}
          <Card>
            <CardHeader>
              <CardTitle>Per agent (30 hari)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {perAgent.length === 0 ? (
                <p className="p-4 text-sm text-fg-muted">Belum ada pemakaian tercatat.</p>
              ) : (
                <div className="divide-y divide-line">
                  {perAgent.map((a) => {
                    const pct =
                      a.daily_cost_limit && a.daily_cost_limit > 0
                        ? Math.min((a.cost_today / a.daily_cost_limit) * 100, 100)
                        : 0;
                    return (
                      <div key={a.agent_id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium text-fg">{a.agent_name}</p>
                          <span className="shrink-0 font-mono text-sm text-fg">{usd(a.cost)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-fg-faint">
                          {compact(a.input_tokens)} in · {compact(a.output_tokens)} out · {a.calls} panggilan
                          {a.daily_cost_limit ? ` · hari ini ${usd(a.cost_today)} / ${usd(a.daily_cost_limit)}` : ""}
                        </p>
                        {a.daily_cost_limit ? (
                          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-canvas-subtle">
                            <div
                              className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-success"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {/* Per model */}
            <Card>
              <CardHeader>
                <CardTitle>Per model (30 hari)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {perModel.length === 0 ? (
                  <p className="p-4 text-sm text-fg-muted">Belum ada data model.</p>
                ) : (
                  <div className="divide-y divide-line">
                    {perModel.map((m) => (
                      <div key={m.model} className="flex items-center justify-between px-4 py-2.5">
                        <span className="truncate font-mono text-xs text-fg-muted">{m.model}</span>
                        <span className="shrink-0 font-mono text-sm text-fg">{usd(m.cost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Token 30d */}
            <Card>
              <CardHeader>
                <CardTitle>Token 30 hari</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-fg-muted">
                  <li className="flex justify-between">
                    <span>Input</span>
                    <span className="font-medium text-fg">{compact(summary.tokens_30d.input)}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Output</span>
                    <span className="font-medium text-fg">{compact(summary.tokens_30d.output)}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>Cached</span>
                    <span className="font-medium text-fg">{compact(summary.tokens_30d.cached)}</span>
                  </li>
                  <li className="flex justify-between border-t border-line pt-1.5">
                    <span>Total</span>
                    <span className="font-medium text-fg">{compact(total30Tokens)}</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
