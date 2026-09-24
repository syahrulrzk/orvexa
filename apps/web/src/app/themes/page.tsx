import { asc, eq } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { themes } from "@/lib/db/schema";
import { requireSessionContext } from "@/lib/session";

const SWATCH_KEYS = ["primary", "success", "warning", "danger", "info", "bg", "surface", "text"];

export default async function ThemesPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Themes">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const themeRows = await db
    .select()
    .from(themes)
    .where(eq(themes.companyId, companyId))
    .orderBy(asc(themes.name));

  return (
    <AppShell
      title="Themes"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Ringkasan</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex justify-between">
                <span>Tema terdaftar</span>
                <span className="font-medium text-fg">{themeRows.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Bawaan</span>
                <span className="font-medium text-fg">{themeRows.filter((t) => t.isBuiltin).length}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Ganti tema aktif lewat theme switcher di topbar — pilihan tersimpan di preferensi user.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Themes</h2>
            <p className="text-sm text-fg-muted">Tema tampilan berbasis design token Orvexa.</p>
          </div>
          <Badge variant="outline">{themeRows.length} tema</Badge>
        </div>

        {themeRows.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-fg-muted">Belum ada tema terdaftar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {themeRows.map((theme) => {
              const tokens = (theme.tokens ?? {}) as Record<string, string>;
              return (
                <Card key={theme.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{theme.name}</CardTitle>
                      {theme.isBuiltin ? <Badge variant="outline">builtin</Badge> : null}
                    </div>
                    <p className="font-mono text-xs text-fg-faint">{theme.key}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-1.5">
                      {SWATCH_KEYS.map((k) => {
                        const value = tokens[k] ?? tokens[`orv-${k}`] ?? tokens[`--orv-${k}`];
                        return value ? (
                          <span
                            key={k}
                            title={`${k}: ${value}`}
                            className="h-6 w-6 rounded-md border border-line"
                            style={{ backgroundColor: value }}
                          />
                        ) : null;
                      })}
                    </div>
                    <p className="mt-3 text-xs text-fg-faint">{Object.keys(tokens).length} token didefinisikan</p>
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
