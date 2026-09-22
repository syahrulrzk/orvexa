import type { ReactNode } from "react";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Layout utama aplikasi (lihat docs/DESIGN.md §4).
 * Sidebar (240px) + konten fleksibel + context panel (320px).
 */
export function AppShell({
  title,
  children,
  context,
}: {
  title?: string;
  children: ReactNode;
  context?: ReactNode;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas text-fg">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {context ? (
        <aside className="hidden w-context shrink-0 overflow-y-auto border-l border-line bg-surface xl:block">
          {context}
        </aside>
      ) : null}
    </div>
  );
}
