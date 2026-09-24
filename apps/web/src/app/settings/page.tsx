import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { SettingsManager } from "@/components/settings/settings-manager";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { companies, sessions } from "@/lib/db/schema";
import { integrationStatuses } from "@/lib/integrations";
import { hasPermission } from "@/lib/rbac";
import { getOrCreateUserPreferences } from "@/lib/settings";
import { requireSessionContext } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await requireSessionContext();

  const [company] = ctx.company
    ? await db
        .select({
          name: companies.name,
          defaultTheme: companies.defaultTheme,
          settings: companies.settings,
        })
        .from(companies)
        .where(eq(companies.id, ctx.company.id))
        .limit(1)
    : [];

  const [prefs, activeSessions, integrations] = await Promise.all([
    getOrCreateUserPreferences(ctx.user.id),
    db
      .select({
        id: sessions.id,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(eq(sessions.userId, ctx.user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
      )
      .orderBy(desc(sessions.createdAt)),
    ctx.company ? integrationStatuses(ctx.company.id) : Promise.resolve([]),
  ]);

  const cs = (company?.settings ?? {}) as Record<string, unknown>;
  const ns = (prefs?.notificationSettings ?? {}) as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  return (
    <AppShell title="Settings">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-fg">Settings</h2>
          <Badge variant="outline">{activeSessions.length} sesi aktif</Badge>
          {integrations.some((i) => i.status === "warning") ? (
            <Badge variant="warning">{integrations.filter((i) => i.status === "warning").length} perlu atensi</Badge>
          ) : null}
        </div>
        <p className="text-sm text-fg-muted">Pengaturan company, preferensi user, keamanan, dan integrasi.</p>
      </div>

      <SettingsManager
        canEditCompany={ctx.company ? hasPermission(ctx.company.role, "settings.manage") : false}
        initialCompany={{
          name: company?.name ?? ctx.company?.name ?? "",
          default_theme: company?.defaultTheme ?? "corporate_gray",
          timezone: typeof cs.timezone === "string" ? cs.timezone : "Asia/Jakarta",
          weekly_cost_report: bool(cs.weekly_cost_report, true),
          require_approval_note: bool(cs.require_approval_note, false),
          allow_user_theme: bool(cs.allow_user_theme, true),
        }}
        initialPreferences={{
          theme_key: prefs?.themeKey ?? "corporate_gray",
          locale: prefs?.locale === "en" ? "en" : "id",
          notifications: {
            email_digest: bool(ns.email_digest, true),
            approval_email: bool(ns.approval_email, true),
            task_updates: bool(ns.task_updates, true),
            mention_only: bool(ns.mention_only, false),
          },
        }}
        initialSessions={activeSessions.map((s) => ({
          id: s.id,
          ip_address: s.ipAddress,
          user_agent: s.userAgent,
          created_at: s.createdAt.toISOString(),
          last_seen_at: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
          expires_at: s.expiresAt.toISOString(),
        }))}
        currentSessionId={ctx.sessionId}
        integrations={integrations}
      />
    </AppShell>
  );
}
