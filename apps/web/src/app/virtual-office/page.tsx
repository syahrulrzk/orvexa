import { redirect } from "next/navigation";

import { OfficeView } from "@/components/office/office-view";
import { getSessionContext } from "@/lib/session";
import { loadOfficeSnapshot } from "@/lib/office";

export const dynamic = "force-dynamic";

/**
 * Virtual Office (Phase 10) — denah AI workforce per departemen.
 * Server component memuat snapshot awal (SSR); update realtime lewat
 * komponen client via SSE `orvexa.office`.
 */
export default async function VirtualOfficePage() {
  const ctx = await getSessionContext();
  if (!ctx?.company) redirect("/login");

  const snapshot = await loadOfficeSnapshot(ctx.company.id);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Virtual Office</h1>
        <p className="text-sm text-fg-faint">
          Denah AI Infrastructure Department — status, task, dan aktivitas agent secara realtime.
        </p>
      </header>

      <OfficeView initial={snapshot} />
    </div>
  );
}
