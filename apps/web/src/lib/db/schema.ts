import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

import { newId } from "../ids";

// ============================================================
// ENUMS
// ============================================================
export const memberRole = pgEnum("member_role", [
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
]);

export const agentStatus = pgEnum("agent_status", [
  "idle",
  "thinking",
  "working",
  "waiting_approval",
  "error",
  "disabled",
]);

export const roomType = pgEnum("room_type", [
  "general",
  "department",
  "incident",
  "project",
  "war_room",
  "direct",
]);

export const messageAuthorType = pgEnum("message_author_type", [
  "human",
  "agent",
  "system",
  "tool",
  "event",
]);

export const messageKind = pgEnum("message_kind", [
  "text",
  "approval",
  "decision",
  "task",
  "document",
  "alert",
  "tool_call",
]);

export const providerKind = pgEnum("provider_kind", [
  "openai",
  "anthropic",
  "gemini",
  "openai_compatible",
  "local",
]);

// ============================================================
// IDENTITY
// ============================================================
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("usr")),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const companies = pgTable("companies", {
  id: text("id").primaryKey().$defaultFn(() => newId("cmp")),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  defaultTheme: text("default_theme").notNull().default("corporate_gray"),
  settings: jsonb("settings").notNull().default({}),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const companyMembers = pgTable(
  "company_members",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("cm")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    invitedBy: text("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_members_uq").on(t.companyId, t.userId),
    index("company_members_user_idx").on(t.userId),
  ],
);

// ============================================================
// SESSIONS & ACCOUNTS (auth — migrasi 0002)
// ============================================================
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("ses")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("acc")),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_provider_uq").on(t.provider, t.providerAccountId),
    index("accounts_user_idx").on(t.userId),
  ],
);

// ============================================================
// PROVIDER & CREDENTIAL
// ============================================================
export const aiProviders = pgTable(
  "ai_providers",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("prv")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: providerKind("kind").notNull(),
    label: text("label").notNull(),
    baseUrl: text("base_url"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("ai_providers_company_idx").on(t.companyId)],
);

export const aiCredentials = pgTable(
  "ai_credentials",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("crd")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    secretCipher: text("secret_cipher").notNull(),
    secretIv: text("secret_iv").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    last4: text("last4"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("ai_credentials_company_idx").on(t.companyId)],
);

export const aiModels = pgTable(
  "ai_models",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("mdl")),
    providerId: text("provider_id")
      .notNull()
      .references(() => aiProviders.id, { onDelete: "cascade" }),
    modelKey: text("model_key").notNull(),
    displayName: text("display_name").notNull(),
    capabilities: text("capabilities").array().notNull().default([]),
    contextWindow: integer("context_window"),
    inputCostPer1k: numeric("input_cost_per_1k", { precision: 12, scale: 6 }),
    outputCostPer1k: numeric("output_cost_per_1k", { precision: 12, scale: 6 }),
    isDefault: boolean("is_default").notNull().default(false),
    isEnabled: boolean("is_enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("ai_models_uq").on(t.providerId, t.modelKey)],
);

// ============================================================
// SKILLS & AGENTS
// ============================================================
export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("skl")),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    description: text("description"),
    promptHint: text("prompt_hint"),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("skills_company_idx").on(t.companyId)],
);

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("agt")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    role: text("role"),
    description: text("description"),
    objective: text("objective"),
    systemPrompt: text("system_prompt"),
    status: agentStatus("status").notNull().default("idle"),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    providerId: text("provider_id").references(() => aiProviders.id),
    modelId: text("model_id").references(() => aiModels.id),
    credentialId: text("credential_id").references(() => aiCredentials.id),
    fallbackCredentialId: text("fallback_credential_id").references(() => aiCredentials.id),
    modelParams: jsonb("model_params").notNull().default({}),
    maxSteps: integer("max_steps").notNull().default(8),
    dailyCostLimit: numeric("daily_cost_limit", { precision: 12, scale: 4 }),
    settings: jsonb("settings").notNull().default({}),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("agents_company_name_uq").on(t.companyId, t.name),
    index("agents_company_idx").on(t.companyId),
  ],
);

export const agentSkills = pgTable(
  "agent_skills",
  {
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.skillId] })],
);

// ============================================================
// TEAMS
// ============================================================
export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("tm")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    defaults: jsonb("defaults").notNull().default({}),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("teams_company_name_uq").on(t.companyId, t.name)],
);

export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey().$defaultFn(() => newId("tmm")),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// ROOMS & MESSAGES
// ============================================================
export const rooms = pgTable(
  "rooms",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("rm")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: roomType("type").notNull().default("general"),
    topic: text("topic"),
    projectId: text("project_id"),
    incidentMeta: jsonb("incident_meta"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("rooms_company_idx").on(t.companyId)],
);

export const roomMembers = pgTable(
  "room_members",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("rmm")),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [index("room_members_room_idx").on(t.roomId)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("msg")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    threadRootId: text("thread_root_id"),
    authorType: messageAuthorType("author_type").notNull(),
    authorUserId: text("author_user_id").references(() => users.id),
    authorAgentId: text("author_agent_id").references(() => agents.id),
    authorRunId: text("author_run_id"),
    kind: messageKind("kind").notNull().default("text"),
    content: text("content"),
    contentJson: jsonb("content_json"),
    mentions: text("mentions").array().notNull().default([]),
    replyToId: text("reply_to_id"),
    meta: jsonb("meta").notNull().default({}),
    isEdited: boolean("is_edited").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
  },
  (t) => [index("messages_room_time_idx").on(t.roomId, t.createdAt.desc())],
);

export const messageThreads = pgTable(
  "message_threads",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("thr")),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    rootMessageId: text("root_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    replyCount: integer("reply_count").notNull().default(0),
    lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
    participantIds: text("participant_ids").array().notNull().default([]),
  },
  (t) => [uniqueIndex("message_threads_root_uq").on(t.rootMessageId)],
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("rea")),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("message_reactions_message_idx").on(t.messageId)],
);

// ============================================================
// ACTIVITY & NOTIFICATIONS
// ============================================================
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("act")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id),
    actorAgentId: text("actor_agent_id").references(() => agents.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    projectId: text("project_id"),
    summary: text("summary"),
    metadata: jsonb("metadata").notNull().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_company_time_idx").on(t.companyId, t.createdAt.desc())],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("ntf")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.isRead)],
);

// ============================================================
// THEMES & PREFERENCES
// ============================================================
export const themes = pgTable(
  "themes",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("thm")),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    tokens: jsonb("tokens").notNull().default({}),
    isBuiltin: boolean("is_builtin").notNull().default(false),
  },
  (t) => [index("themes_company_idx").on(t.companyId)],
);

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activeCompanyId: text("active_company_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  themeId: text("theme_id").references(() => themes.id, { onDelete: "set null" }),
  themeKey: text("theme_key").notNull().default("corporate_gray"),
  locale: text("locale").notNull().default("id"),
  notificationSettings: jsonb("notification_settings").notNull().default({}),
  uiState: jsonb("ui_state").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// ENUMS (domains lanjutan — migrasi 0001)
// ============================================================
export const taskStatus = pgEnum("task_status", [
  "backlog",
  "in_progress",
  "blocked",
  "review",
  "done",
  "failed",
  "cancelled",
]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high", "critical"]);
export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
  "cancelled",
]);
export const decisionStatus = pgEnum("decision_status", [
  "proposed",
  "approved",
  "rejected",
  "superseded",
]);
export const permissionEffect = pgEnum("permission_effect", [
  "allow",
  "approval_required",
  "disabled",
]);
export const knowledgeScope = pgEnum("knowledge_scope", [
  "company",
  "team",
  "project",
  "room",
  "agent",
]);
export const docStatus = pgEnum("doc_status", ["draft", "final", "archived"]);
export const mcpTransport = pgEnum("mcp_transport", ["stdio", "sse", "http"]);
export const agentRunStatus = pgEnum("agent_run_status", [
  "queued",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
]);

// ============================================================
// PROJECTS
// ============================================================
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("prj")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    ownerTeamId: text("owner_team_id").references(() => teams.id),
    startDate: date("start_date"),
    targetDate: date("target_date"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("projects_company_idx").on(t.companyId)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("pjm")),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (t) => [index("project_members_project_idx").on(t.projectId)],
);

// ============================================================
// TASKS
// ============================================================
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("tsk")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("backlog"),
    priority: taskPriority("priority").notNull().default("medium"),
    assignedTeamId: text("assigned_team_id").references(() => teams.id),
    assignedAgentId: text("assigned_agent_id").references(() => agents.id),
    assignedUserId: text("assigned_user_id").references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    result: text("result"),
    createdByType: text("created_by_type").notNull().default("human"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    createdByAgentId: text("created_by_agent_id").references(() => agents.id),
    parentTaskId: text("parent_task_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_company_status_idx").on(t.companyId, t.status),
    index("tasks_assignee_agent_idx").on(t.assignedAgentId),
    index("tasks_project_idx").on(t.projectId),
  ],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: text("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnId] })],
);

// ============================================================
// AGENT RUNS
// ============================================================
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("run")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    triggerKind: text("trigger_kind").notNull(),
    triggerRefId: text("trigger_ref_id"),
    status: agentRunStatus("status").notNull().default("queued"),
    parentRunId: text("parent_run_id"),
    stepCount: integer("step_count").notNull().default(0),
    toolCalls: jsonb("tool_calls").notNull().default([]),
    state: jsonb("state").notNull().default({}),
    result: text("result"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("runs_agent_time_idx").on(t.agentId, t.createdAt.desc()),
    index("runs_room_idx").on(t.roomId, t.createdAt.desc()),
  ],
);

// ============================================================
// APPROVALS & DECISIONS
// ============================================================
export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("apr")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull().default({}),
    riskLevel: text("risk_level").notNull().default("medium"),
    rollbackPlan: text("rollback_plan"),
    status: approvalStatus("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: text("decided_by").references(() => users.id),
    decisionNote: text("decision_note"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("approvals_pending_idx").on(t.companyId, t.status)],
);

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("dec")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    approvalId: text("approval_id").references(() => approvals.id, { onDelete: "set null" }),
    code: text("code"),
    title: text("title").notNull(),
    rationale: text("rationale"),
    status: decisionStatus("status").notNull().default("proposed"),
    participants: jsonb("participants").notNull().default([]),
    approvedBy: text("approved_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("decisions_company_code_uq").on(t.companyId, t.code)],
);

// ============================================================
// DOCUMENTS & ATTACHMENTS
// ============================================================
export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("doc")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    decisionId: text("decision_id").references(() => decisions.id, { onDelete: "set null" }),
    authorAgentId: text("author_agent_id").references(() => agents.id),
    authorUserId: text("author_user_id").references(() => users.id),
    docType: text("doc_type").notNull(),
    title: text("title").notNull(),
    contentMd: text("content_md"),
    contentJson: jsonb("content_json"),
    status: docStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    generatedByRunId: text("generated_by_run_id").references(() => agentRuns.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("documents_company_idx").on(t.companyId, t.docType)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("att")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    checksum: text("checksum"),
    uploadedBy: text("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachments_message_idx").on(t.messageId)],
);

// ============================================================
// KNOWLEDGE BASE & RAG
// ============================================================
export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("kb")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    parentId: text("parent_id"),
    embeddingModel: text("embedding_model"),
    embeddingDim: integer("embedding_dim").notNull().default(1536),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("kb_company_idx").on(t.companyId)],
);

export const agentKnowledge = pgTable(
  "agent_knowledge",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("akn")),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    canRead: boolean("can_read").notNull().default(true),
    canWrite: boolean("can_write").notNull().default(false),
  },
  (t) => [uniqueIndex("agent_knowledge_uq").on(t.agentId, t.knowledgeBaseId)],
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("kdc")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    knowledgeBaseId: text("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUri: text("source_uri"),
    storageKey: text("storage_key"),
    checksum: text("checksum"),
    status: text("status").notNull().default("pending"),
    scope: knowledgeScope("scope").notNull().default("company"),
    scopeId: text("scope_id"),
    metadata: jsonb("metadata").notNull().default({}),
    tokenCount: integer("token_count"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("kdoc_kb_idx").on(t.knowledgeBaseId, t.status)],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("kch")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("kchunks_doc_idx").on(t.documentId, t.chunkIndex)],
);

export const knowledgeAcl = pgTable(
  "knowledge_acl",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("kac")),
    documentId: text("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    canRead: boolean("can_read").notNull().default(true),
    canWrite: boolean("can_write").notNull().default(false),
  },
  (t) => [uniqueIndex("knowledge_acl_uq").on(t.documentId, t.subjectType, t.subjectId)],
);

// ============================================================
// AGENT TOOLS & PERMISSIONS
// ============================================================
export const agentTools = pgTable(
  "agent_tools",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("atl")),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    toolKey: text("tool_key").notNull(),
    config: jsonb("config").notNull().default({}),
    isEnabled: boolean("is_enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("agent_tools_uq").on(t.agentId, t.toolKey)],
);

export const agentPermissions = pgTable(
  "agent_permissions",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("apm")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull().default("agent"),
    scopeId: text("scope_id"),
    permission: text("permission").notNull(),
    effect: permissionEffect("effect").notNull().default("approval_required"),
    conditions: jsonb("conditions").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_permissions_agent_idx").on(t.agentId, t.permission)],
);

// ============================================================
// AGENT EVENTS, MEMORY, USAGE
// ============================================================
export const agentEvents = pgTable(
  "agent_events",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("aev")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => agentRuns.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agent_events_run_idx").on(t.runId, t.createdAt)],
);

export const agentMemories = pgTable(
  "agent_memories",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("mem")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    scopeId: text("scope_id"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    importance: numeric("importance", { precision: 4, scale: 2 }).notNull().default("0.5"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("memories_agent_scope_idx").on(t.agentId, t.scope, t.scopeId)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("use")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    providerId: text("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
    modelId: text("model_id").references(() => aiModels.id, { onDelete: "set null" }),
    credentialId: text("credential_id").references(() => aiCredentials.id, {
      onDelete: "set null",
    }),
    agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
    runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 6 }).notNull().default("0"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("usage_company_time_idx").on(t.companyId, t.createdAt),
    index("usage_agent_idx").on(t.agentId, t.createdAt),
  ],
);

// ============================================================
// MCP
// ============================================================
export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("mcp")),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    transport: mcpTransport("transport").notNull().default("http"),
    endpoint: text("endpoint"),
    command: text("command"),
    authCipher: text("auth_cipher"),
    authIv: text("auth_iv"),
    isEnabled: boolean("is_enabled").notNull().default(true),
    config: jsonb("config").notNull().default({}),
    healthStatus: text("health_status").notNull().default("unknown"),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mcp_servers_company_idx").on(t.companyId)],
);

export const mcpTools = pgTable(
  "mcp_tools",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("mtl")),
    mcpServerId: text("mcp_server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    description: text("description"),
    inputSchema: jsonb("input_schema").notNull().default({}),
    riskLevel: text("risk_level").notNull().default("low"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    isEnabled: boolean("is_enabled").notNull().default(true),
  },
  (t) => [uniqueIndex("mcp_tools_uq").on(t.mcpServerId, t.toolName)],
);

export const agentMcpAccess = pgTable(
  "agent_mcp_access",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("ama")),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    mcpServerId: text("mcp_server_id")
      .notNull()
      .references(() => mcpServers.id, { onDelete: "cascade" }),
    allowedTools: text("allowed_tools").array().notNull().default([]),
  },
  (t) => [uniqueIndex("agent_mcp_access_uq").on(t.agentId, t.mcpServerId)],
);
