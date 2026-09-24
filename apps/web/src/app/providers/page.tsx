import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { ProviderManager } from "@/components/providers/provider-manager";
import { Badge } from "@/components/ui/badge";
import { hasMasterKey } from "@/lib/crypto";
import { db } from "@/lib/db";
import { aiCredentials, aiProviders } from "@/lib/db/schema";
import { requireSessionContext } from "@/lib/session";

export default async function ProvidersPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="AI Providers">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const providerRows = await db
    .select()
    .from(aiProviders)
    .where(and(eq(aiProviders.companyId, companyId), isNull(aiProviders.deletedAt)))
    .orderBy(asc(aiProviders.createdAt));

  const credRows = await db
    .select({
      id: aiCredentials.id,
      providerId: aiCredentials.providerId,
      label: aiCredentials.label,
      last4: aiCredentials.last4,
      isEnabled: aiCredentials.isEnabled,
      createdAt: aiCredentials.createdAt,
    })
    .from(aiCredentials)
    .where(and(eq(aiCredentials.companyId, companyId), isNull(aiCredentials.deletedAt)))
    .orderBy(desc(aiCredentials.createdAt));

  const providers = providerRows.map((p) => {
    const cfg = (p.config ?? {}) as Record<string, unknown>;
    return {
      id: p.id,
      kind: p.kind as string,
      label: p.label,
      baseUrl: p.baseUrl,
      isEnabled: p.isEnabled,
      defaultModel: typeof cfg.default_model === "string" ? cfg.default_model : null,
      credentials: credRows
        .filter((c) => c.providerId === p.id)
        .map((c) => ({ id: c.id, label: c.label, last4: c.last4, isEnabled: c.isEnabled, createdAt: c.createdAt })),
    };
  });

  const activeCreds = providers.reduce((n, p) => n + p.credentials.filter((c) => c.isEnabled).length, 0);

  return (
    <AppShell
      title="AI Providers"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Ringkasan</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex justify-between">
                <span>Provider terdaftar</span>
                <span className="font-medium text-fg">{providers.length}</span>
              </li>
              <li className="flex justify-between">
                <span>API key aktif</span>
                <span className="font-medium text-fg">{activeCreds}</span>
              </li>
              <li className="flex justify-between">
                <span>Master key</span>
                <Badge variant={hasMasterKey() ? "success" : "danger"}>{hasMasterKey() ? "ready" : "missing"}</Badge>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Urutan resolusi kredensial</h2>
            <ol className="mt-3 list-inside list-decimal space-y-1.5 text-sm text-fg-muted">
              <li>Kredensial milik agent</li>
              <li>Kredensial company (provider sama)</li>
              <li>Environment variable (.env)</li>
            </ol>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              API key dienkripsi AES-256-GCM sebelum disimpan dan hanya ditampilkan sebagai 4 digit terakhir.
              Rotasi key menonaktifkan versi lama secara otomatis.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">LLM Providers</h2>
            <p className="text-sm text-fg-muted">
              Sambungkan OpenAI, Anthropic, Gemini, endpoint OpenAI-compatible, atau model lokal.
            </p>
          </div>
          <Badge variant="outline">{providers.length} provider</Badge>
        </div>

        <ProviderManager providers={providers} masterKeyReady={hasMasterKey()} />
      </div>
    </AppShell>
  );
}
