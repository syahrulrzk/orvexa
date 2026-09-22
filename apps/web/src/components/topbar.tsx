import { Bell } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSessionContext } from "@/lib/session";
import { ThemeSwitcher } from "./theme-switcher";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export async function Topbar({ title = "Dashboard" }: { title?: string }) {
  const ctx = await getSessionContext();

  return (
    <header className="flex h-topbar items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-foreground">{title}</h1>
        <Badge variant="outline" className="hidden sm:inline-flex">
          WIB
        </Badge>
        {ctx?.company ? (
          <span className="hidden text-xs text-muted-foreground md:inline">{ctx.company.name}</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <ThemeSwitcher />
        <Button variant="outline" size="icon" aria-label="Notifikasi">
          <Bell />
        </Button>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
            {ctx ? initials(ctx.user.displayName) : "?"}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {ctx?.user.displayName ?? "Guest"}
          </span>
        </div>
        {ctx ? (
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" type="submit">
              Logout
            </Button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
