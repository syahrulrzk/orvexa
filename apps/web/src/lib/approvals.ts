import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { logActivity } from "./activity";
import { db } from "./db";
import { agents, approvals } from "./db/schema";
import { publishRoomEvent } from "./events";
import { newId } from "./ids";
import { enqueueAgentJob } from "./jobs";
import { executeTool } from "./tools";

/**
 * Approval workflow (F5-03): request → decide → resume checkpoint.
 *
 * - **Request** — dipanggil dari `executeTool()` saat permission matrix
 *   menghasilkan `approval_required` (HTTP 202 ke worker). Membuat baris
 *   `approvals` + event realtime di room + status agent `waiting_approval`.
 * - **Decide** — manusia memutuskan via `/api/v1/approvals/:id/decide`
 *   (halaman /approvals). `approve` → tool dieksekusi SEKALI dengan override
 *   allow yang ter-audit (kredensial sekali pakai, bukan perubahan matrix);
 *   `reject` → tidak dieksekusi.
 * - **Resume** — keputusan meng-enqueue job `agent.run` ke agent dengan
 *   trigger.kind `approval.resume` sehingga agent melanjutkan pekerjaannya
 *   dengan hasil keputusan (jalur worker yang sama dengan run biasa).
 */

export type ApprovalDecision = "approved" | "rejected";

const DEFAULT_EXPIRY_HOURS = 24;

// ============================================================
// REQUEST — buat approval pending dari tool call
// ============================================================

export async function requestApproval(input: {
  companyId: string;
  agentId: string;
  runId?: string | null;
  roomId?: string | null;
  taskId?: string | null;
  toolKey: string;
  args: Record<string, unknown>;
  riskLevel?: string;
  reason?: string;
}): Promise<string> {
  // Ringkas argumen — payload bisa besar; jangan simpan secret mentah.
  const payload = {
    tool_key: input.toolKey,
    args: summarizeArgs(input.toolKey, input.args),
    reason: input.reason ?? null,
  };

  // Judul yang enak dibaca manusia di room & halaman approvals.
  const title =
    input.reason ??
    `Eksekusi tool ${input.toolKey} oleh agent (butuh persetujuan).`;

  const [row] = await db
    .insert(approvals)
    .values({
      id: newId("apr"),
      companyId: input.companyId,
      roomId: input.roomId ?? null,
      agentId: input.agentId,
      runId: input.runId ?? null,
      taskId: input.taskId ?? null,
      title,
      action: input.toolKey,
      payload,
      riskLevel: input.riskLevel ?? "high",
      status: "pending",
      expiresAt: new Date(Date.now() + DEFAULT_EXPIRY_HOURS * 3600 * 1000),
    })
    .returning();

  // Status agent → waiting_approval (terlihat di Virtual Office & room).
  await db
    .update(agents)
    .set({ status: "waiting_approval", updatedAt: new Date() })
    .where(eq(agents.id, input.agentId));

  // Event realtime ke room + activity log.
  if (input.roomId) {
    await publishRoomEvent(input.roomId, "approval.requested", {
      approval: {
        id: row.id,
        title: row.title,
        action: row.action,
        risk_level: row.riskLevel,
        agent_id: row.agentId,
      },
    });
  }
  await logActivity({
    companyId: input.companyId,
    actor: { type: "agent", agentId: input.agentId },
    action: "approval.requested",
    targetType: "approval",
    targetId: row.id,
    roomId: input.roomId ?? null,
    summary: `Approval diminta: ${row.title}`,
    metadata: { tool_key: input.toolKey, run_id: input.runId ?? null },
  });

  return row.id;
}

/** Ringkas & sanitasi argumen untuk payload approval (tanpa secret). */
function summarizeArgs(toolKey: string, args: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (/key|secret|token|password/i.test(k)) {
      clean[k] = "«redacted»";
      continue;
    }
    if (typeof v === "string" && v.length > 500) {
      clean[k] = v.slice(0, 500) + "…";
      continue;
    }
    clean[k] = v;
  }
  void toolKey;
  return clean;
}

// ============================================================
// DECIDE + RESUME — keputusan manusia & kelanjutan run
// ============================================================

export async function decideApproval(input: {
  approvalId: string;
  companyId: string;
  decidedBy: string;
  decision: ApprovalDecision;
  note?: string | null;
}): Promise<{ status: string; resumeJobId: string | null; executed: boolean }> {
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.companyId, input.companyId)))
    .limit(1);
  if (!approval) throw new Error("APPROVAL_NOT_FOUND");
  if (approval.status !== "pending") throw new Error("ALREADY_DECIDED");

  const now = new Date();

  // ---- Jalur REJECT: cukup catat & resume penolakan ----
  if (input.decision === "rejected") {
    const [row] = await db
      .update(approvals)
      .set({
        status: "rejected",
        decidedAt: now,
        decidedBy: input.decidedBy,
        decisionNote: input.note ?? null,
      })
      .where(eq(approvals.id, approval.id))
      .returning();

    await resumeAgentAfterDecision(row);
    return { status: "rejected", resumeJobId: null, executed: false };
  }

  // ---- Jalur APPROVE: eksekusi tool SEKALI dengan override allow ----
  const payload = (approval.payload ?? {}) as { tool_key?: string; args?: Record<string, unknown> };
  const toolKey = payload.tool_key ?? approval.action;
  const args = (payload.args ?? {}) as Record<string, unknown>;

  let executed = false;
  let execError: string | null = null;
  try {
    const result = await executeTool(
      toolKey,
      args,
      {
        companyId: approval.companyId,
        agentId: approval.agentId ?? "",
        roomId: approval.roomId,
        runId: approval.runId,
      },
      // Kredensial sekali pakai: override allow untuk EKSEKUSI INI saja.
      // Matrix per-perusahaan TIDAK diubah — panggilan berikutnya tetap
      // melalui approval.
      { permissionRows: [{ permission: toolKey, effect: "allow", conditions: {} }] },
    );
    executed = result.ok;
    if (!result.ok) execError = result.error ?? "tool gagal";
  } catch (err) {
    execError = err instanceof Error ? err.message : String(err);
    executed = false;
  }

  const [row] = await db
    .update(approvals)
    .set({
      status: "approved",
      decidedAt: now,
      decidedBy: input.decidedBy,
      decisionNote: [input.note, execError ? `error: ${execError}` : null]
        .filter(Boolean)
        .join(" — ") || null,
    })
    .where(eq(approvals.id, approval.id))
    .returning();

  // ---- RESUME: bangunkan agent dengan hasil keputusan ----
  let resumeJobId: string | null = null;
  if (approval.agentId) {
    resumeJobId = await enqueueAgentJob({
      companyId: approval.companyId,
      agentId: approval.agentId,
      roomId: approval.roomId,
      trigger: {
        kind: "approval.resume",
        approval_id: row.id,
        decision: row.status,
        tool_key: toolKey,
        executed,
        exec_error: execError,
        decided_by: input.decidedBy,
      },
    });
  }

  await resumeAgentAfterDecision(row);
  return { status: row.status, resumeJobId, executed };
}

/** Setelah keputusan: kembalikan status agent ke idle + event ke room + audit. */
async function resumeAgentAfterDecision(row: typeof approvals.$inferSelect): Promise<void> {
  if (row.agentId) {
    // Kembali idle hanya jika masih waiting_approval karena approval ini.
    await db
      .update(agents)
      .set({ status: "idle", updatedAt: new Date() })
      .where(and(eq(agents.id, row.agentId), eq(agents.status, "waiting_approval")));
  }

  if (row.roomId) {
    await publishRoomEvent(row.roomId, "approval.resolved", {
      approval: {
        id: row.id,
        title: row.title,
        action: row.action,
        status: row.status,
        decided_at: row.decidedAt?.toISOString?.() ?? null,
      },
    });
  }

  await logActivity({
    companyId: row.companyId,
    actor: { type: "system" },
    action: row.status === "approved" ? "approval.approved" : "approval.rejected",
    targetType: "approval",
    targetId: row.id,
    roomId: row.roomId,
    summary: `Approval ${row.status}: ${row.title}`,
    metadata: { tool_key: row.action, decision_note: row.decisionNote },
  });
}

// ============================================================
// EXPIRE — approval kedaluwarsa otomatis (dipanggil on-demand)
// ============================================================

export async function expireStaleApprovals(companyId: string): Promise<number> {
  const now = new Date();
  const expired = await db
    .update(approvals)
    .set({ status: "expired", decidedAt: now })
    .where(
      and(
        eq(approvals.companyId, companyId),
        eq(approvals.status, "pending"),
        lt(approvals.expiresAt, now),
      ),
    )
    .returning({ id: approvals.id, agentId: approvals.agentId, roomId: approvals.roomId });

  // Agent yang hanya menunggu approval kedaluwarsa → kembali idle.
  const waitingAgentIds = expired.map((e) => e.agentId).filter((id): id is string => Boolean(id));
  if (waitingAgentIds.length) {
    await db
      .update(agents)
      .set({ status: "idle", updatedAt: new Date() })
      .where(and(inArray(agents.id, waitingAgentIds), eq(agents.status, "waiting_approval")));
  }

  for (const e of expired) {
    await logActivity({
      companyId,
      actor: { type: "system" },
      action: "approval.expired",
      targetType: "approval",
      targetId: e.id,
      roomId: e.roomId,
      summary: "Approval kedaluwarsa tanpa keputusan.",
    });
  }
  return expired.length;
}

/** Hitungan pending untuk badge halaman Approvals. */
export async function countPendingApprovals(companyId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(approvals)
    .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")));
  return row?.n ?? 0;
}
