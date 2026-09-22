import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSessionContext } from "@/lib/session";
import { cookies } from "next/headers";

export default async function ThemesPage() {
  const ctx = await requireSessionContext();
  const cookieStore = await cookies();

  // Fetch themes from API
  const themesRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/themes`, {
    headers: {
      Cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  const themesData = await themesRes.json();
  const themes = themesData.success ? themesData.data.themes : [];

  return (
    <AppShell title="Themes">
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Themes</h2>
            <p className="text-sm text-muted-foreground">
              Kelola tema tampilan dan tema brand custom.
            </p>
          </div>
          <Button>Create Theme</Button>
        </div>

        {themes.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Belum ada custom theme. Gunakan theme switcher di topbar untuk tema bawaan.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {themes.map((theme: any) => (
              <Card key={theme.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle>{theme.name}</CardTitle>
                    {theme.is_builtin && (
                      <Badge variant="secondary">Builtin</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{theme.key}</p>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-4">
                    {Object.keys(theme.tokens || {}).length} tokens defined
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
