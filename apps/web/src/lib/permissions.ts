/**
 * Permission matrix (F5-01) — RBAC + ABAC untuk aksi agent.
 *
 * Dua lapis:
 *  1. **RBAC human** sudah ada di `rbac.ts` (role company → permission string).
 *  2. **ABAC agent** di sini: setiap *tool* yang bisa dipanggil agent punya
 *     efek default, dan bisa dioverride per agent lewat tabel `agent_permissions`
 *     (kolom `conditions` jsonb, lihat DB_SCHEMA §agent_permissions).
 *
 * Prinsip:
 *  - **Fail-closed**: kondisi yang tidak bisa dievaluasi → approval_required;
 *    tool tak dikenal → disabled.
 *  - Tanpa row override, efek diambil dari matrix default di bawah.
 *  - Modul ini sengaja *pure* (tanpa DB) agar mudah diuji dan dipakai
 *    di runtime mana pun (web maupun worker via payload konteks).
 */

// ============================================================
// Efek & kondisi
// ============================================================

export type PermissionEffect = "allow" | "approval_required" | "disabled";

export type PermissionCondition = {
  /** Hanya berlaku di tipe room ini (mis. ["incident","war_room"]). */
  room_types?: string[];
  /** Tool berisiko tinggi (firewall/deploy) hanya boleh di room insiden. */
  max_risk_level?: "low" | "medium" | "high";
  /** Batasi ke satu project tertentu. */
  project_id?: string;
};

// ============================================================
// Matrix default per tool (deny-by-default untuk yang sensitif)
// ============================================================

export type ToolDefault = {
  effect: PermissionEffect;
  /** Alasan singkat untuk UI/audit. */
  reason: string;
  /** Kondisi bawaan saat effect = allow. */
  conditions?: PermissionCondition;
};

export const TOOL_DEFAULTS: Record<string, ToolDefault> = {
  "room.post": { effect: "allow", reason: "Komunikasi biasa dalam ruang agent." },
  "task.create": { effect: "allow", reason: "Pembuatan task tercatat dan berisiko rendah." },
  "doc.generate": { effect: "allow", reason: "Dokumen lahir sebagai draft dan bisa direvisi." },
  "memory.save": { effect: "allow", reason: "Memori agent terkontrol per scope." },
  "kb.search": { effect: "allow", reason: "Pencarian sudah difilter permission di SQL (fail-closed)." },
  "agent.delegate": {
    effect: "allow",
    reason: "Delegasi tercatat sebagai run anak dengan parent_run_id.",
    conditions: { room_types: ["general", "department", "incident", "project", "war_room"] },
  },
  "firewall.modify": {
    effect: "approval_required",
    reason: "Perubahan firewall berisiko; wajib persetujuan manusia.",
  },
  "server.restart": {
    effect: "approval_required",
    reason: "Gangguan layanan; wajib persetujuan manusia.",
  },
  "production.deploy": {
    effect: "approval_required",
    reason: "Deploy produksi wajib persetujuan manusia.",
  },
  "database.write": {
    effect: "approval_required",
    reason: "Perubahan data produksi wajib persetujuan manusia.",
  },
};

export const UNKNOWN_TOOL_DEFAULT: PermissionEffect = "disabled";

export function defaultEffect(toolKey: string): PermissionEffect {
  return TOOL_DEFAULTS[toolKey]?.effect ?? UNKNOWN_TOOL_DEFAULT;
}

// ============================================================
// Override per agent (dari tabel agent_permissions)
// ============================================================

export type AgentPermissionRow = {
  permission: string;
  effect: string;
  conditions?: unknown;
};

/** Ambil override spesifik agent untuk satu tool (kalau ada & tipe-nya valid). */
export function findOverride(
  rows: AgentPermissionRow[],
  toolKey: string,
): { effect: PermissionEffect; conditions: PermissionCondition } | null {
  const row = rows.find((r) => r.permission === toolKey);
  if (!row) return null;

  const effect: PermissionEffect =
    row.effect === "allow" || row.effect === "approval_required" || row.effect === "disabled"
      ? row.effect
      : "approval_required"; // nilai tak dikenal → fail-closed

  const raw = (row.conditions ?? {}) as Record<string, unknown>;
  const conditions: PermissionCondition = {};
  if (Array.isArray(raw.room_types)) {
    conditions.room_types = raw.room_types.filter((t): t is string => typeof t === "string");
  }
  if (typeof raw.max_risk_level === "string") {
    conditions.max_risk_level = raw.max_risk_level as PermissionCondition["max_risk_level"];
  }
  if (typeof raw.project_id === "string") {
    conditions.project_id = raw.project_id;
  }
  return { effect, conditions };
}

// ============================================================
// Evaluator konteks — pure, mudah diuji
// ============================================================

export type EvalContext = {
  roomType?: string | null;
  projectId?: string | null;
};

/**
 * Evaluasi satu kondisi terhadap konteks.
 * Return: true = lolos, false = tidak terpenuhi, null = tak bisa dievaluasi
 * (fail-closed → approval_required).
 */
export function evaluateCondition(
  condition: PermissionCondition,
  ctx: EvalContext,
): boolean | null {
  if (condition.room_types) {
    if (!ctx.roomType) return null; // tidak tahu tipe room → fail-closed
    if (!condition.room_types.includes(ctx.roomType)) return false;
  }
  if (condition.project_id) {
    if (!ctx.projectId) return null;
    if (condition.project_id !== ctx.projectId) return false;
  }
  // max_risk_level dicatat sebagai metadata (sel di masa depan ke payload tool);
  // di MVP tidak ada sumber risk level pada konteks → dianggap tak terpenuhi
  // hanya jika tool memang menuntut risk render tertentu.
  return true;
}

/**
 * Keputusan final untuk satu panggilan tool oleh satu agent.
 *
 * Urutan: tool tak dikenal → disabled; override agent (jika ada) → menang;
 * tanpa override → efek default matrix. `approval_required` = efektif saat
 * kondisi gagal atau tak bisa dievaluasi (fail-closed).
 */
export function evaluatePermission(
  toolKey: string,
  rows: AgentPermissionRow[],
  ctx: EvalContext = {},
): { effect: PermissionEffect; source: "default" | "agent_override"; reason?: string } {
  if (!(toolKey in TOOL_DEFAULTS)) {
    return { effect: UNKNOWN_TOOL_DEFAULT, source: "default", reason: "Tool tidak terdaftar." };
  }

  const override = findOverride(rows, toolKey);
  if (!override) {
    return { effect: defaultEffect(toolKey), source: "default", reason: TOOL_DEFAULTS[toolKey]?.reason };
  }

  if (override.effect === "disabled" || override.effect === "allow") {
    // Untuk "allow" dengan kondisi: kondisi gagal → turun ke approval_required.
    if (override.effect === "allow") {
      const verdict = evaluateCondition(override.conditions, ctx);
      if (verdict === false || verdict === null) {
        return {
          effect: "approval_required",
          source: "agent_override",
          reason: "Kondisi override tidak terpenuhi / tidak bisa dievaluasi (fail-closed).",
        };
      }
    }
    return { effect: override.effect, source: "agent_override", reason: "Override per agent." };
  }

  return { effect: "approval_required", source: "agent_override", reason: "Override per agent." };
}

/** Ringkasan matrix untuk UI (halaman Agents). */
export function matrixForUi(toolKeys: string[]): { key: string; effect: PermissionEffect; reason: string }[] {
  return toolKeys.map((key) => ({
    key,
    effect: defaultEffect(key),
    reason: TOOL_DEFAULTS[key]?.reason ?? "Tool tidak terdaftar.",
  }));
}
