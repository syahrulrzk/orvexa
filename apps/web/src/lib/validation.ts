import { z } from "zod";

export const roomTypeSchema = z.enum([
  "general",
  "department",
  "incident",
  "project",
  "war_room",
  "direct",
]);

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: roomTypeSchema.default("general"),
  topic: z.string().trim().max(500).nullish(),
  project_id: z.string().nullish(),
  member_agent_ids: z.array(z.string()).max(50).optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().max(500).nullish(),
  is_archived: z.boolean().optional(),
});

export const addRoomMemberSchema = z
  .object({
    agent_id: z.string().nullish(),
    user_id: z.string().nullish(),
    role: z.enum(["member", "observer", "lead"]).default("member"),
  })
  .refine(
    (d) => (d.agent_id ? 1 : 0) + (d.user_id ? 1 : 0) === 1,
    { message: "Isi salah satu: agent_id atau user_id" },
  );

export const createMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  kind: z.enum(["text", "alert"]).default("text"),
  mentions: z.array(z.string()).max(50).optional(),
  thread_root_id: z.string().nullish(),
  reply_to_id: z.string().nullish(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});

// ============================================================
// TASKS (F4-02)
// ============================================================
export const taskStatusSchema = z.enum([
  "backlog",
  "in_progress",
  "blocked",
  "review",
  "done",
  "failed",
  "cancelled",
]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).nullish(),
  status: taskStatusSchema.default("backlog"),
  priority: taskPrioritySchema.default("medium"),
  project_id: z.string().nullish(),
  room_id: z.string().nullish(),
  assigned_agent_id: z.string().nullish(),
  assigned_user_id: z.string().nullish(),
  assigned_team_id: z.string().nullish(),
  due_date: z.string().nullish(), // ISO 8601
  parent_task_id: z.string().nullish(),
  depends_on: z.array(z.string()).max(20).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10000).nullish(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  project_id: z.string().nullish(),
  assigned_agent_id: z.string().nullish(),
  assigned_user_id: z.string().nullish(),
  assigned_team_id: z.string().nullish(),
  due_date: z.string().nullish(),
  result: z.string().max(20000).nullish(),
});

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  project_id: z.string().optional(),
  assigned_agent_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

export const addDependencySchema = z.object({
  depends_on_id: z.string().min(1).max(64),
});

// ============================================================
// KNOWLEDGE BASE (F4-04/F4-05)
// ============================================================
export const createKnowledgeBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  embedding_model: z.string().trim().max(120).nullish(),
  embedding_dim: z.coerce.number().int().min(64).max(4096).optional(),
});

export const searchKnowledgeSchema = z.object({
  q: z.string().trim().min(1).max(2000),
  kb_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ============================================================
// DECISIONS & DOCUMENTS (F4-06)
// ============================================================
export const decisionStatusSchema = z.enum(["proposed", "approved", "rejected", "superseded"]);

export const createDecisionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  rationale: z.string().trim().max(20000).nullish(),
  status: decisionStatusSchema.optional(),
  code: z.string().trim().max(40).optional(),
  project_id: z.string().nullish(),
  room_id: z.string().nullish(),
  approval_id: z.string().nullish(),
  participants: z.array(z.object({ type: z.string(), id: z.string(), name: z.string() })).max(50).optional(),
});

export const updateDecisionSchema = z.object({
  status: decisionStatusSchema,
  rationale: z.string().trim().max(20000).nullish(),
});

export const docTypeSchema = z.enum(["mop", "sop", "rca", "report", "runbook", "other"]);

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  doc_type: docTypeSchema,
  content_md: z.string().min(1).max(200000),
  status: z.enum(["draft", "final"]).default("draft"),
  project_id: z.string().nullish(),
  room_id: z.string().nullish(),
  task_id: z.string().nullish(),
  decision_id: z.string().nullish(),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content_md: z.string().min(1).max(200000).optional(),
  status: z.enum(["draft", "final", "archived"]).optional(),
});

// ============================================================
// AGENTS (CRUD UI)
// ============================================================
export const agentStatusSchema = z.enum([
  "idle",
  "thinking",
  "working",
  "waiting_approval",
  "error",
  "disabled",
]);

export const createAgentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "Nama agent: huruf, angka, dan tanda hubung."),
  display_name: z.string().trim().min(1).max(120).optional(),
  role: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(2000).nullish(),
  objective: z.string().trim().max(2000).nullish(),
  system_prompt: z.string().trim().max(20000).nullish(),
  provider_id: z.string().nullish(),
  model_id: z.string().nullish(),
  credential_id: z.string().nullish(),
  model: z.string().trim().max(120).nullish(),
  max_steps: z.coerce.number().int().min(1).max(64).optional(),
  daily_cost_limit: z.coerce.number().min(0).max(100000).nullish(),
  skill_ids: z.array(z.string()).max(100).optional(),
  tool_keys: z.array(z.string()).max(100).optional(),
  knowledge_base_ids: z.array(z.string()).max(50).optional(),
});

export const permissionOverrideSchema = z.object({
  tool_key: z.string().trim().min(1).max(120),
  effect: z.enum(["allow", "approval_required", "disabled"]),
  conditions: z
    .object({
      room_types: z.array(z.string()).max(10).optional(),
      max_risk_level: z.enum(["low", "medium", "high"]).optional(),
      project_id: z.string().max(64).optional(),
    })
    .optional(),
});

export const updateAgentSchema = z.object({
  display_name: z.string().trim().min(1).max(120).nullish(),
  role: z.string().trim().max(120).nullish(),
  description: z.string().trim().max(2000).nullish(),
  objective: z.string().trim().max(2000).nullish(),
  system_prompt: z.string().trim().max(20000).nullish(),
  provider_id: z.string().nullish(),
  model_id: z.string().nullish(),
  credential_id: z.string().nullish(),
  model: z.string().trim().max(120).nullish(),
  max_steps: z.coerce.number().int().min(1).max(64).nullish(),
  daily_cost_limit: z.coerce.number().min(0).max(100000).nullish(),
  status: agentStatusSchema.nullish(),
  skill_ids: z.array(z.string()).max(100).optional(),
  tool_keys: z.array(z.string()).max(100).optional(),
  knowledge_base_ids: z.array(z.string()).max(50).optional(),
  permission_overrides: z.array(permissionOverrideSchema).max(50).optional(),
});

// ============================================================
// AI PROVIDERS & CREDENTIALS (CRUD UI)
// ============================================================
export const providerKindSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "openai_compatible",
  "local",
]);

export const createProviderSchema = z.object({
  kind: providerKindSchema,
  label: z.string().trim().min(1).max(120),
  base_url: z.string().trim().max(500).nullish(),
  default_model: z.string().trim().max(120).nullish(),
  api_key: z.string().trim().max(500).nullish(),
  is_enabled: z.boolean().optional(),
});

export const updateProviderSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  base_url: z.string().trim().max(500).nullish(),
  default_model: z.string().trim().max(120).nullish(),
  api_key: z.string().trim().max(500).nullish(),
  is_enabled: z.boolean().optional(),
});

// ============================================================
// PROJECTS (CRUD UI)
// ============================================================
export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).nullish(),
  status: z.enum(["planning", "active", "on_hold", "completed", "archived"]).default("active"),
  owner_team_id: z.string().nullish(),
  start_date: z.string().nullish(), // YYYY-MM-DD
  target_date: z.string().nullish(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).nullish(),
  status: z.enum(["planning", "active", "on_hold", "completed", "archived"]).optional(),
  owner_team_id: z.string().nullish(),
  start_date: z.string().nullish(),
  target_date: z.string().nullish(),
});

// ============================================================
// SETTINGS (Fase 5 — halaman Settings)
// ============================================================
export const updateUserPreferencesSchema = z.object({
  theme_key: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(["id", "en"]).optional(),
  notification_settings: z
    .object({
      email_digest: z.boolean().optional(),
      approval_email: z.boolean().optional(),
      task_updates: z.boolean().optional(),
      mention_only: z.boolean().optional(),
    })
    .optional(),
});

export const updateCompanySettingsSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  default_theme: z.string().trim().min(1).max(60).optional(),
  settings: z
    .object({
      timezone: z.string().trim().min(1).max(60).optional(),
      weekly_cost_report: z.boolean().optional(),
      require_approval_note: z.boolean().optional(),
      allow_user_theme: z.boolean().optional(),
    })
    .optional(),
});

export const revokeSessionsSchema = z.object({
  session_id: z.string().trim().min(1).optional(),
  all: z.boolean().optional(),
});
