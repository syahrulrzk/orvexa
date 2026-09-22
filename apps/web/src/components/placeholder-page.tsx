import { AppShell } from "./app-shell";

export function PlaceholderPage({
  title,
  description,
  planned,
}: {
  title: string;
  description: string;
  planned?: string;
}) {
  return (
    <AppShell title={title}>
      <div className="p-6">
        <div className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">{description}</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="rounded-md border border-line bg-canvas-subtle px-2 py-0.5 text-overline uppercase text-fg-faint">
              Belum diimplementasikan
            </span>
            {planned ? <span className="text-xs text-fg-faint">{planned}</span> : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
