import { ThemeSwitcher } from "./theme-switcher";

export function Topbar({ title = "Dashboard" }: { title?: string }) {
  return (
    <header className="flex h-topbar items-center justify-between border-b border-line bg-surface px-4">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-semibold text-fg">{title}</h1>
        <span className="hidden rounded-md border border-line px-1.5 py-0.5 text-overline uppercase text-fg-faint sm:inline">
          WIB
        </span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeSwitcher />
        <button
          type="button"
          aria-label="Notifikasi"
          className="rounded-md border border-line px-2 py-1 text-xs text-fg-muted hover:bg-canvas-subtle"
        >
          🔔
        </button>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-canvas-subtle text-xs font-medium text-fg-muted">
            IL
          </span>
          <span className="hidden text-xs text-fg-muted sm:inline">IT Lead</span>
        </div>
      </div>
    </header>
  );
}
